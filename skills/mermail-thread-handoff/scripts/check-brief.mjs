import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 128 * 1024;
const kinds = new Set(["decision", "superseded-proposal", "open-question", "next-action"]);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const flag = (value) => value === true || value === false || value === null;
const fail = (code) => { throw new Error(code); };

// Checks a normalized local packet, not raw MCP output or semantic entailment.
// Error codes deliberately never interpolate email content or supplied paths.
export function checkBrief(packet) {
  if (!record(packet) || !text(packet.mailboxId, 200) || !text(packet.threadId, 200)
    || !text(packet.observedAt, 40)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(packet.observedAt)
    || !Number.isFinite(Date.parse(packet.observedAt)) || !flag(packet.hasMore)) fail("INVALID_SCOPE");
  if (!Array.isArray(packet.messages) || packet.messages.length > 30
    || !Array.isArray(packet.findings) || packet.findings.length > 40) fail("INVALID_BOUNDS");

  const sources = new Map();
  const gaps = new Set();
  let bodyChars = 0;
  if (packet.hasMore !== false) gaps.add("unread-or-unknown-pages");
  if (packet.messages.length === 0) gaps.add("no-messages");

  for (const message of packet.messages) {
    if (!record(message) || !text(message.id, 200)
      || message.mailboxId !== packet.mailboxId || message.threadId !== packet.threadId) fail("SOURCE_SCOPE_MISMATCH");
    if (sources.has(message.id)) fail("DUPLICATE_SOURCE_ID");
    if (!flag(message.contentOmitted) || !flag(message.truncated)
      || !(message.scanStatus === null || text(message.scanStatus, 40))) fail("INVALID_SOURCE_FLAGS");
    const readable = message.scanStatus === "clean" && message.contentOmitted === false;
    if (!readable && message.body !== undefined) fail("UNSAFE_BODY_PRESENT");
    if (readable && typeof message.body !== "string") fail("MISSING_READABLE_BODY");
    if (!readable) gaps.add("omitted-or-non-clean-content");
    if (message.truncated !== false) gaps.add("truncated-or-unknown-content");
    bodyChars += message.body?.length ?? 0;
    if (bodyChars > 30000) fail("BODY_BUDGET_EXCEEDED");
    sources.set(message.id, { ...message, readable });
  }

  let evidenceCount = 0;
  for (const finding of packet.findings) {
    if (!record(finding) || !kinds.has(finding.kind) || !text(finding.text, 1000)
      || !Array.isArray(finding.evidence) || finding.evidence.length < 1
      || finding.evidence.length > 6) fail("INVALID_FINDING");
    const citedIds = new Set();
    for (const evidence of finding.evidence) {
      if (!record(evidence) || !text(evidence.emailId, 200) || !text(evidence.quote, 500)) fail("INVALID_CITATION");
      const source = sources.get(evidence.emailId);
      if (!source || !source.readable) fail("UNREADABLE_CITATION_SOURCE");
      if (!source.body.includes(evidence.quote)) fail("QUOTE_NOT_IN_SOURCE");
      citedIds.add(evidence.emailId);
      evidenceCount++;
    }
    if (finding.kind === "superseded-proposal" && citedIds.size < 2) fail("CHANGE_NEEDS_TWO_SOURCES");
  }

  return {
    valid: true,
    coverage: gaps.size ? "limited" : "reviewed-slice",
    gaps: [...gaps].sort(),
    messages: sources.size,
    findings: packet.findings.length,
    evidence: evidenceCount,
    checks: "scope, bounds, flags, source IDs, exact quotes; not semantic entailment or live provenance",
  };
}

export async function main(args) {
  if (args.length !== 1) fail("USAGE: node check-brief.mjs path/to/brief.json");
  const handle = await open(args[0], "r");
  let packet;
  try {
    // A bounded read also protects against the file growing after stat().
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) fail("PACKET_TOO_LARGE");
    try { packet = JSON.parse(buffer.subarray(0, length).toString("utf8")); }
    catch { fail("INVALID_JSON"); }
  } finally {
    await handle.close();
  }
  return checkBrief(packet);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
  } catch (error) {
    const known = /^(INVALID_|SOURCE_|DUPLICATE_|UNSAFE_|MISSING_|BODY_|UNREADABLE_|QUOTE_|CHANGE_|PACKET_|USAGE:)/;
    console.error(known.test(error.message) ? error.message : "CANNOT_READ_PACKET");
    process.exitCode = 1;
  }
}
