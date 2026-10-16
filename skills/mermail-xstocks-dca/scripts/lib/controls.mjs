import { isInstant, parseInstant } from "./core.mjs";
import { addressOf, bodyTextOf, receivedAtOf, senderOf } from "./mail.mjs";
import { mandateId, shortId } from "./mandate.mjs";

export { addressOf } from "./mail.mjs";

// Email is untrusted and unauthenticated (Mermail exposes no sender verdict). It may only
// reduce authority: PAUSE or STOP. Anything that reads like a request for more authority is
// recorded as an escalation and never acted on.
const REPLY_HEADER = /^(On .+ wrote:|-{2,} ?Original Message ?-{2,}|From: .+)$/i;
const ESCALATION = /\b(resume|unpause|restart|start|raise|increase|double|buy|purchase|send|transfer|withdraw|add|change|swap|replace|limit|cap|approve|unlock)\b/i;

export function parseControl(text) {
  const lines = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (REPLY_HEADER.test(line)) break;
    if (line.startsWith(">")) continue;
    lines.push(line);
  }
  const first = lines.find((line) => line.length > 0) ?? "";
  const command = first.toUpperCase().replace(/[.!\s]+$/, "");
  if (command === "PAUSE") return { action: "pause" };
  if (command === "STOP") return { action: "stop" };
  const hit = ESCALATION.exec(lines.join("\n"));
  return hit ? { action: "escalation", keyword: hit[1].toLowerCase() } : { action: "none" };
}

// Bodies are read as plain text with quoted history removed, capped at 10,000 characters.
const CONTROL_BODY_LIMIT = 10_000;

export function evaluateControls(mandate, ledger, emails) {
  const tag = `#${shortId(mandateId(mandate))}`;
  const owner = mandate.owner.email.toLowerCase();
  const desk = mandate.mailbox.email.toLowerCase();
  const seen = new Set(ledger.filter((entry) => entry.kind === "control_seen").map((entry) => entry.data.emailId));
  const records = [];
  // A message without a readable date or body (still being scanned, or content omitted) is left
  // unmarked so a later tick reads it; it must never be recorded as "seen" with no action.
  const readable = emails.filter((email) => isInstant(receivedAtOf(email)) && !email?.content_omitted
    && [email?.text, email?.html, email?.body].some((part) => typeof part === "string"));
  const ordered = readable.sort((a, b) => parseInstant(receivedAtOf(a)) - parseInstant(receivedAtOf(b)));
  for (const email of ordered) {
    if (!email?.id || seen.has(email.id)) continue;
    if (!String(email.subject ?? "").includes(tag) || addressOf(senderOf(email)) === desk) continue;
    seen.add(email.id);
    const fromOwner = addressOf(senderOf(email)) === owner;
    const parsed = parseControl(bodyTextOf(email, { dropQuotes: true, limit: CONTROL_BODY_LIMIT }));
    records.push({ kind: "control_seen", data: { emailId: email.id, fromOwner, action: parsed.action } });
    if (parsed.action === "escalation") {
      records.push({ kind: "escalation_ignored", data: { emailId: email.id, keyword: parsed.keyword, fromOwner } });
    } else if (fromOwner && parsed.action === "pause") {
      records.push({ kind: "paused", data: { emailId: email.id, by: "email" } });
    } else if (fromOwner && parsed.action === "stop") {
      records.push({ kind: "revoked", data: { emailId: email.id, by: "email" } });
    }
  }
  return records;
}
