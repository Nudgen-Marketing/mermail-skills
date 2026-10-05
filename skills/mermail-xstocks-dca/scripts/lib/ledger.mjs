import { addressOf } from "./controls.mjs";
import { DcaError, canonical, parseInstant, sha256Hex } from "./core.mjs";

export const LEDGER_SCHEMA = "mermail-xstocks-dca/ledger@1";
export const LEDGER_FENCE = "mermail-dca-ledger";
export const GENESIS_PREV = "0".repeat(64);
export const KINDS = new Set([
  "genesis", "intent", "submitted", "filled", "failed", "uncertain", "skipped", "refused",
  "paused", "resumed", "revoked", "escalation_ignored", "control_seen", "statement",
]);

export function hashEntry(entry) {
  const { hash, ...body } = entry;
  return sha256Hex(canonical(body));
}

export function appendEntry(ledger, { at, kind, slot = null, leg = null, data = {} }) {
  if (!KINDS.has(kind)) throw new DcaError("ledger_kind", String(kind));
  const atMs = parseInstant(at);
  if ((kind === "genesis") !== (ledger.length === 0)) throw new DcaError("ledger_genesis", kind);
  const last = ledger.at(-1);
  if (last && atMs < parseInstant(last.at)) throw new DcaError("ledger_time_reversed", at);
  const body = { schema: LEDGER_SCHEMA, seq: ledger.length, prev: last ? last.hash : GENESIS_PREV, at, kind, slot, leg, data };
  const entry = { ...body, hash: sha256Hex(canonical(body)) };
  return { ledger: [...ledger, entry], entry };
}

export function verifyChain(ledger, expectedMandateId) {
  if (!Array.isArray(ledger) || ledger.length === 0) return { ok: false, reason: "empty", seq: 0 };
  let prev = GENESIS_PREV;
  let lastMs = -Infinity;
  for (let index = 0; index < ledger.length; index += 1) {
    const entry = ledger[index];
    const fail = (reason) => ({ ok: false, reason, seq: index });
    if (entry?.schema !== LEDGER_SCHEMA) return fail("schema");
    if (entry.seq !== index) return fail("seq");
    if (entry.prev !== prev) return fail("prev");
    if (!KINDS.has(entry.kind) || (index === 0) !== (entry.kind === "genesis")) return fail("kind");
    let atMs;
    try {
      atMs = parseInstant(entry.at);
    } catch {
      return fail("at");
    }
    if (atMs < lastMs) return fail("time");
    if (hashEntry(entry) !== entry.hash) return fail("hash");
    prev = entry.hash;
    lastMs = atMs;
  }
  if (ledger[0].data?.mandateId !== expectedMandateId) return { ok: false, reason: "mandate_mismatch", seq: 0 };
  return { ok: true, length: ledger.length, head: prev };
}

export const ledgerBlock = (entry) => `\`\`\`${LEDGER_FENCE}\n${canonical(entry)}\n\`\`\``;

// Mail clients may soft-wrap long lines; canonical JSON has no newlines, so unwrapping is safe
// and any real corruption is still caught by the hash check.
function parseBlock(body) {
  for (const candidate of [body, body.replace(/\r?\n/g, ""), body.replace(/ ?\r?\n/g, "")]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next unwrap
    }
  }
  return { malformed: true };
}

export function extractLedgerBlocks(text) {
  const pattern = new RegExp(`\`\`\`${LEDGER_FENCE}\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``, "g");
  return [...String(text ?? "").matchAll(pattern)].map((match) => parseBlock(match[1]));
}

export function htmlToText(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Ledger records are only trusted from mail the desk itself sent. Anyone can email the desk a
// well-formed chain (the hashes are unkeyed), so inbound mail is never a source of records.
export function blocksFromEmails(emails, { from } = {}) {
  const sender = from === undefined ? null : from.toLowerCase();
  return emails.filter((email) => sender === null || addressOf(email?.from) === sender).flatMap((email) => {
    const text = String(email?.text ?? "");
    return text.includes(`\`\`\`${LEDGER_FENCE}`) ? extractLedgerBlocks(text) : extractLedgerBlocks(htmlToText(email?.html));
  });
}

export function rebuildLedger(blocks, expectedMandateId) {
  const bySeq = new Map();
  for (const block of blocks) {
    if (block?.malformed || !Number.isInteger(block?.seq)) return { ok: false, reason: "malformed_block" };
    const seen = bySeq.get(block.seq);
    // Compare whole records, not just the claimed hash: a forged twin can copy the hash field.
    if (seen && canonical(seen) !== canonical(block)) return { ok: false, reason: "conflicting_blocks", seq: block.seq };
    bySeq.set(block.seq, block);
  }
  const ledger = [...bySeq.keys()].sort((a, b) => a - b).map((seq) => bySeq.get(seq));
  const gap = ledger.findIndex((entry, index) => entry.seq !== index);
  if (gap !== -1) return { ok: false, reason: "gap", seq: gap };
  const verdict = verifyChain(ledger, expectedMandateId);
  return verdict.ok ? { ok: true, ledger } : verdict;
}

export function compareLedgers(local, mailed) {
  const mailedHashes = new Map(mailed.filter((block) => Number.isInteger(block?.seq)).map((block) => [block.seq, block.hash]));
  for (const entry of local) {
    const hash = mailedHashes.get(entry.seq);
    if (hash !== undefined && hash !== entry.hash) return { ok: false, reason: "diverged", seq: entry.seq };
  }
  return { ok: true, comparedThroughSeq: Math.max(-1, ...mailedHashes.keys()) };
}
