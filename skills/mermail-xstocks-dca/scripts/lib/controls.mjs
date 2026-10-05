import { parseInstant } from "./core.mjs";
import { mandateId, shortId } from "./mandate.mjs";

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

// Strict on purpose: a header we cannot read unambiguously (several addresses, an address
// hidden in a quoted display name) belongs to nobody, so it can never match the owner or the desk.
const BARE_ADDRESS = /^[^\s<>",;]+@[^\s<>",;]+$/;
const NAMED_ADDRESS = /^[^<>,;]*<([^\s<>",;]+@[^\s<>",;]+)>$/;

export function addressOf(from) {
  const text = String(from ?? "").trim();
  if (BARE_ADDRESS.test(text)) return text.toLowerCase();
  const named = NAMED_ADDRESS.exec(text);
  return named ? named[1].toLowerCase() : "";
}

export function evaluateControls(mandate, ledger, emails) {
  const tag = `#${shortId(mandateId(mandate))}`;
  const owner = mandate.owner.email.toLowerCase();
  const desk = mandate.mailbox.email.toLowerCase();
  const seen = new Set(ledger.filter((entry) => entry.kind === "control_seen").map((entry) => entry.data.emailId));
  const records = [];
  const ordered = [...emails].sort((a, b) => parseInstant(a.receivedAt) - parseInstant(b.receivedAt));
  for (const email of ordered) {
    if (!email?.id || seen.has(email.id)) continue;
    if (!String(email.subject ?? "").includes(tag) || addressOf(email.from) === desk) continue;
    seen.add(email.id);
    const fromOwner = addressOf(email.from) === owner;
    const parsed = parseControl(email.text);
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
