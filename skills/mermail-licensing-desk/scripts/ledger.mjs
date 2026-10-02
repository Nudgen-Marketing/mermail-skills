#!/usr/bin/env node
// Append-only, hash-chained receipt ledger for mermail-licensing-desk.
// Every line commits to the previous line, so any edit or deletion breaks `verify`.
//
//   node ledger.mjs append --ledger desk.receipts.jsonl --action send --ref msg_123 --detail '{"to":"a@b.co"}'
//   node ledger.mjs verify --ledger desk.receipts.jsonl
//   node ledger.mjs head   --ledger desk.receipts.jsonl
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { canonical, sha256 } from "./quote.mjs";

export const ACTIONS = new Set([
  "read",
  "classify",
  "quote",
  "draft",
  "file",
  "approval",
  "send",
  "license",
  "payout_preview",
  "payout_request",
  "payout_status",
  "blocked",
]);
export const GENESIS = "0".repeat(64);

export function readLedger(text) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function makeEntry(previous, { action, ref, detail = {}, ts }) {
  if (!ACTIONS.has(action)) throw new Error(`unknown action "${action}"`);
  if (!ref) throw new Error("ref is required (email, draft, message, quote, license, or request id)");
  const body = {
    seq: previous ? previous.seq + 1 : 1,
    ts: ts ?? new Date().toISOString(),
    action,
    ref,
    detail,
    prev: previous ? previous.hash : GENESIS,
  };
  return { ...body, hash: sha256(canonical(body)) };
}

export function verifyEntries(entries) {
  let prev = GENESIS;
  for (const [index, entry] of entries.entries()) {
    const { hash, ...body } = entry;
    if (entry.seq !== index + 1) return { ok: false, at: index + 1, reason: "sequence gap" };
    if (entry.prev !== prev) return { ok: false, at: entry.seq, reason: "broken chain" };
    if (sha256(canonical(body)) !== hash) return { ok: false, at: entry.seq, reason: "hash mismatch" };
    prev = hash;
  }
  return { ok: true, entries: entries.length, head: prev };
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) {
      out._.push(argv[i]);
      continue;
    }
    out[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

export function main(argv) {
  const a = args(argv);
  const command = a._[0];
  const file = a.ledger;
  if (!file) {
    process.stdout.write('{"status":"error","message":"--ledger is required"}\n');
    return 2;
  }
  const entries = existsSync(file) ? readLedger(readFileSync(file, "utf8")) : [];
  if (command === "append") {
    const check = verifyEntries(entries);
    if (!check.ok) {
      process.stdout.write(`${JSON.stringify({ status: "refused", ...check })}\n`);
      return 3;
    }
    const entry = makeEntry(entries.at(-1), {
      action: a.action,
      ref: a.ref,
      detail: a.detail ? JSON.parse(a.detail) : {},
      ts: a.ts,
    });
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
    process.stdout.write(`${JSON.stringify({ status: "appended", seq: entry.seq, hash: entry.hash })}\n`);
    return 0;
  }
  if (command === "verify" || command === "head") {
    const check = verifyEntries(entries);
    process.stdout.write(`${JSON.stringify(check)}\n`);
    return check.ok ? 0 : 3;
  }
  process.stdout.write('{"status":"error","message":"command must be append, verify, or head"}\n');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
