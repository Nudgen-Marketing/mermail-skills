#!/usr/bin/env node
/**
 * commitments.js — deterministic local ledger for mermail-commitment-keeper.
 *
 * Node 22+, zero dependencies. All dates are YYYY-MM-DD. All output is JSON.
 * Exit codes: 0 ok · 1 usage error · 2 refused / validation.
 *
 * Subcommands:
 *   add       --creditor E --debtor E --promise S --due DATE --evidence-email-id ID
 *             --mailbox-id ID --key KEY [--file P] [--today DATE]
 *   list      --mailbox-id ID [--status open|fulfilled|closed|cancelled] [--file P]
 *   due       --mailbox-id ID [--on DATE] [--file P] [--today DATE]
 *   preflight --id ID --mailbox-id ID [--max-count N] [--min-gap-days N] [--today DATE]
 *   followup  --id ID --key KEY --message-id CONFIRMED_SENT_ID [--date DATE] [--draft-id ID] [--note S]
 *             --mailbox-id ID [--max-count N] [--min-gap-days N] [--file P] [--today DATE]
 *   complete  --id ID --evidence-email-id ID --mailbox-id ID [--quote S] [--file P] [--today DATE]
 *   close     --id ID --reason fulfilled|cancelled|waived --mailbox-id ID [--file P] [--today DATE]
 *
 * Invariants enforced here (the agent must respect refusals, never hand-edit the file):
 *   - add requires --key, scoped by mailbox and bound to the immutable add payload
 *   - complete requires evidence email id; close:fulfilled requires prior complete
 *   - followup enforces a per-commitment count cap and minimum day gap
 *   - every entry is bound to one mailboxId; cross-mailbox operations are refused
 *   - local rename is not a concurrent pre-send reservation or mail receipt ledger
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const USAGE_EXIT = 1;
const REFUSED_EXIT = 2;

class UsageError extends Error {}
class RefusedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- date helpers ----------

function todayISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}

function validISODate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---------- arg parsing ----------

function parseArgs(argv) {
  const args = { _: [] };
  const allowed = new Set(["creditor", "debtor", "promise", "due", "evidence-email-id", "mailbox-id", "key", "file", "today", "status", "on", "id", "date", "draft-id", "message-id", "note", "max-count", "min-gap-days", "quote", "reason", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      throw new UsageError("unexpected positional argument");
    }
    const key = a.slice(2);
    if (!allowed.has(key)) throw new UsageError("unknown argument");
    if (Object.hasOwn(args, key)) throw new UsageError("duplicate argument");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      if (key !== "help") throw new UsageError("argument value required");
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function reqStr(args, name) {
  const v = args[name];
  if (typeof v !== "string" || v.trim() === "" || v.length > 10000 || v === true) {
    if (name === "evidence-email-id") throw new RefusedError("evidence_required", "source/evidence email id is required");
    throw new UsageError(`missing required --${name}`);
  }
  return v.trim();
}

function optStr(args, name, fallback = null) {
  const v = args[name];
  if (v === undefined || v === true) return fallback;
  return String(v).trim();
}

function reqDate(args, name) {
  const v = reqStr(args, name);
  if (!validISODate(v)) {
    throw new UsageError(`--${name} must be a valid YYYY-MM-DD date`);
  }
  return v;
}

function optInt(args, name, fallback) {
  const v = args[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (typeof v !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(v) || !Number.isSafeInteger(n) || n > 10000) {
    throw new UsageError(`--${name} must be an integer from 0 through 10000`);
  }
  return n;
}

// ---------- storage ----------

function load(file, allowNew = false) {
  if (!fs.existsSync(file)) {
    if (allowNew) return { version: 1, commitments: [] };
    throw new RefusedError("ledger_missing", "ledger unavailable; stop rather than treating it as empty");
  }
  let raw;
  try {
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) throw new Error("size");
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new RefusedError("ledger_corrupt", "ledger is invalid or oversized; stop for owner recovery");
  }
  if (!raw || raw.version !== 1 || !Array.isArray(raw.commitments) || raw.commitments.length > 10000) {
    throw new RefusedError("ledger_corrupt", "invalid ledger schema");
  }
  const ids = new Set(), keys = new Set(), recordKeys = new Set(), messageIds = new Set();
  for (const c of raw.commitments) {
    if (!c || typeof c !== "object" ||
        ["id", "key", "mailboxId", "creditor", "debtor", "promise", "evidenceEmailId"].some(k => typeof c[k] !== "string" || !c[k].trim() || c[k].length > 10000) ||
        !validISODate(c.dueDate) || !["open", "fulfilled", "closed", "cancelled"].includes(c.status) ||
        !Array.isArray(c.followUps) || c.followUps.length > 10000 ||
        c.followUps.some(f => !f || typeof f !== "object" || !validISODate(f.date)) ||
        c.followUps.some((f, i) => i > 0 && f.date < c.followUps[i - 1].date) ||
        (c.addPayloadHash !== undefined && (typeof c.addPayloadHash !== "string" || !/^[a-f0-9]{64}$/.test(c.addPayloadHash))) ||
        ids.has(c.id) || keys.has(JSON.stringify([c.mailboxId, c.key]))) {
      throw new RefusedError("ledger_corrupt", "invalid or ambiguous ledger entries");
    }
    ids.add(c.id); keys.add(JSON.stringify([c.mailboxId, c.key]));
    for (const f of c.followUps) {
      if (f.key === undefined && f.messageId === undefined && f.recordHash === undefined) continue; // read-only legacy history
      const recordKey = JSON.stringify([c.mailboxId, f.key]);
      const messageKey = JSON.stringify([c.mailboxId, f.messageId]);
      const payload = { key: f.key, messageId: f.messageId, date: f.date, draftId: f.draftId, note: f.note };
      const hash = crypto.createHash("sha256").update(JSON.stringify([c.mailboxId, c.id, payload])).digest("hex");
      if (typeof f.key !== "string" || !f.key.trim() || typeof f.messageId !== "string" || !f.messageId.trim() ||
          f.recordHash !== hash || recordKeys.has(recordKey) || messageIds.has(messageKey)) {
        throw new RefusedError("ledger_corrupt", "invalid or ambiguous follow-up bookkeeping");
      }
      recordKeys.add(recordKey); messageIds.add(messageKey);
    }
  }
  return raw;
}

function save(file, data) {
  const serialized = JSON.stringify(data, null, 2) + "\n";
  if (Buffer.byteLength(serialized) > 1024 * 1024) throw new RefusedError("ledger_limit", "ledger size limit; stop for owner recovery");
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, serialized, { flag: "wx", mode: 0o600 });
  fs.renameSync(tmp, file);
}

function newId(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `c-${h.slice(0, 24)}`;
}

function find(data, id, mailboxId) {
  const entry = data.commitments.find((c) => c.id === id && c.mailboxId === mailboxId);
  if (!entry) {
    throw new RefusedError("not_found_or_out_of_scope", "no commitment in the selected mailbox scope");
  }
  return entry;
}

function checkMailbox(entry, args) {
  const mbox = reqStr(args, "mailbox-id");
  if (mbox !== entry.mailboxId) {
    throw new RefusedError(
      "cross_mailbox_refused",
      "operation does not match selected mailbox scope"
    );
  }
}

function followupPolicy(c, today, args) {
  const cap = optInt(args, "max-count", 3);
  const minGapDays = optInt(args, "min-gap-days", 3);
  const last = c.followUps.at(-1);
  let reason = null;
  if (c.status !== "open") reason = "not_open";
  else if (c.dueDate > today) reason = "not_due";
  else if (c.followUps.length >= cap || (last && daysBetween(last.date, today) < minGapDays)) reason = "followup_frequency_cap";
  return { followupEligible: reason === null, followupReason: reason, cap, minGapDays,
    preflightOnly: true, atomicReservation: false };
}

function entryView(c, today, args = {}) {
  const dDue = daysBetween(today, c.dueDate); // >0 future, 0 today, <0 past
  const last = c.followUps.length ? c.followUps[c.followUps.length - 1] : null;
  return {
    id: c.id,
    creditor: c.creditor,
    debtor: c.debtor,
    promise: c.promise,
    dueDate: c.dueDate,
    status: c.status,
    evidenceEmailId: c.evidenceEmailId,
    mailboxId: c.mailboxId,
    followUpCount: c.followUps.length,
    lastFollowUpDate: last ? last.date : null,
    ...followupPolicy(c, today, args),
    ...(c.status === "open"
      ? {
          dueClass: dDue > 0 ? "upcoming" : dDue === 0 ? "due" : "overdue",
          ...(dDue < 0 ? { daysOverdue: -dDue } : {}),
        }
      : {}),
  };
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

// ---------- commands ----------

function cmdAdd(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const key = reqStr(args, "key");
  const entry = {
    id: newId(JSON.stringify([reqStr(args, "mailbox-id"), key])),
    key,
    mailboxId: reqStr(args, "mailbox-id"),
    creditor: reqStr(args, "creditor"),
    debtor: reqStr(args, "debtor"),
    promise: reqStr(args, "promise"),
    dueDate: reqDate(args, "due"),
    status: "open",
    evidenceEmailId: reqStr(args, "evidence-email-id"),
    createdAt: `${today}T00:00:00Z`,
    fulfilledAt: null,
    closedAt: null,
    closeReason: null,
    followUps: [],
  };
  const payload = Object.fromEntries(["mailboxId", "creditor", "debtor", "promise", "dueDate", "evidenceEmailId"].map(k => [k, entry[k]]));
  entry.addPayloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const data = load(file, true);
  const existing = data.commitments.find((c) => c.mailboxId === entry.mailboxId && c.key === key);
  if (existing) {
    if (!existing.addPayloadHash) throw new RefusedError("idempotency_unverified", "legacy add payload is not verifiable; owner migration required");
    if (existing.addPayloadHash !== entry.addPayloadHash) throw new RefusedError("idempotency_conflict", "key already binds a different add payload in this mailbox");
    emit({ ok: true, created: false, duplicate_add_ignored: true, commitment: entryView(existing, today) });
    return;
  }
  data.commitments.push(entry);
  save(file, data);
  emit({ ok: true, created: true, commitment: entryView(entry, today) });
}

function cmdList(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError("--today must be YYYY-MM-DD");
  const mbox = reqStr(args, "mailbox-id");
  const data = load(file);
  let items = data.commitments;
  const status = optStr(args, "status");
  if (status) {
    if (!["open", "fulfilled", "closed", "cancelled"].includes(status)) {
      throw new UsageError(`--status must be open|fulfilled|closed|cancelled`);
    }
    items = items.filter((c) => c.status === status);
  }
  items = items.filter((c) => c.mailboxId === mbox);
  items = items.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1));
  emit({ ok: true, today, count: items.length, commitments: items.map((c) => entryView(c, today, args)) });
}

function cmdDue(args, file) {
  const today = optStr(args, "today");
  if (today !== null && !validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const on = optStr(args, "on") || today || todayISO();
  if (!validISODate(on)) {
    throw new UsageError(`--on must be YYYY-MM-DD`);
  }
  const refToday = today || todayISO();
  const data = load(file);
  const mbox = reqStr(args, "mailbox-id");
  let items = data.commitments.filter((c) => c.status === "open" && c.dueDate <= on);
  items = items.filter((c) => c.mailboxId === mbox);
  items = items.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1));
  emit({ ok: true, on, today: refToday, count: items.length, commitments: items.map((c) => entryView(c, refToday, args)) });
}

function cmdPreflight(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError("--today must be YYYY-MM-DD");
  const mailboxId = reqStr(args, "mailbox-id");
  const entry = find(load(file), reqStr(args, "id"), mailboxId);
  emit({ ok: true, today, commitment: entryView(entry, today, args),
    warning: "read-only eligibility; not an atomic pre-send cap reservation or authorization" });
}

function cmdFollowup(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const data = load(file);
  const entry = find(data, reqStr(args, "id"), reqStr(args, "mailbox-id"));
  checkMailbox(entry, args);
  const date = optStr(args, "date") || today;
  if (!validISODate(date)) throw new UsageError(`--date must be YYYY-MM-DD`);
  const rec = {
    key: reqStr(args, "key"),
    messageId: reqStr(args, "message-id"),
    date,
    draftId: optStr(args, "draft-id"),
    note: optStr(args, "note"),
  };
  const recordHash = crypto.createHash("sha256").update(JSON.stringify([entry.mailboxId, entry.id, rec])).digest("hex");
  for (const candidate of data.commitments.filter(c => c.mailboxId === entry.mailboxId)) {
    const prior = candidate.followUps.find(f => f.key === rec.key || f.messageId === rec.messageId);
    if (prior) {
      if (candidate.id !== entry.id || prior.recordHash !== recordHash) throw new RefusedError("idempotency_conflict", "follow-up record key/message already binds different bookkeeping in this mailbox");
      emit({ ok: true, recorded: false, duplicate_record_ignored: true, commitment: entryView(entry, today, args), bookkeepingOnly: true });
      return;
    }
  }
  rec.recordHash = recordHash;
  if (date !== today) throw new RefusedError("followup_date_mismatch", "record date must equal the trusted run date; no backdating/future records");
  const policy = followupPolicy(entry, today, args);
  if (!policy.followupEligible) throw new RefusedError(policy.followupReason, "follow-up not eligible under the same preflight policy");
  entry.followUps.push(rec);
  save(file, data);
  emit({
    ok: true,
    recorded: true,
    commitment: {
      id: entry.id,
      followUpCount: entry.followUps.length,
      lastFollowUpDate: date,
      ...followupPolicy(entry, today, args),
      eligibleForAnother: followupPolicy(entry, today, args).followupEligible,
      bookkeepingOnly: true,
    },
  });
}

function cmdComplete(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const data = load(file);
  const entry = find(data, reqStr(args, "id"), reqStr(args, "mailbox-id"));
  checkMailbox(entry, args);
  if (entry.status !== "open") {
    throw new RefusedError("not_open", `commitment ${entry.id} is ${entry.status}; only open commitments can be completed`);
  }
  const evidence = reqStr(args, "evidence-email-id"); // refuses with evidence_required
  entry.status = "fulfilled";
  entry.evidenceEmailId = evidence;
  entry.fulfilledAt = `${today}T00:00:00Z`;
  entry.evidenceQuote = optStr(args, "quote");
  save(file, data);
  emit({ ok: true, commitment: entryView(entry, today), next: `close --id ${entry.id} --reason fulfilled` });
}

function cmdClose(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const data = load(file);
  const entry = find(data, reqStr(args, "id"), reqStr(args, "mailbox-id"));
  checkMailbox(entry, args);
  const reason = reqStr(args, "reason");
  if (!["fulfilled", "cancelled", "waived"].includes(reason)) {
    throw new UsageError(`--reason must be fulfilled|cancelled|waived`);
  }
  if (entry.status === "closed" || entry.status === "cancelled") {
    throw new RefusedError("already_closed", `commitment ${entry.id} is already ${entry.status} (closedAt ${entry.closedAt})`);
  }
  if (reason === "fulfilled" && entry.status !== "fulfilled") {
    throw new RefusedError(
      "evidence_required",
      `close reason "fulfilled" requires a prior complete step with --evidence-email-id; commitment ${entry.id} is ${entry.status}`
    );
  }
  entry.status = "closed";
  entry.closedAt = `${today}T00:00:00Z`;
  entry.closeReason = reason;
  save(file, data);
  emit({ ok: true, commitment: { ...entryView(entry, today), closeReason: entry.closeReason, closedAt: entry.closedAt } });
}

// ---------- main ----------

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  let args, file;
  const commands = { add: cmdAdd, list: cmdList, due: cmdDue, preflight: cmdPreflight, followup: cmdFollowup, complete: cmdComplete, close: cmdClose };

  try { args = parseArgs(argv.slice(1)); file = optStr(args, "file") || "commitments.json"; }
  catch { process.stderr.write(JSON.stringify({ ok: false, error: "usage", message: "invalid arguments" }) + "\n"); process.exit(USAGE_EXIT); }

  if (!cmd || cmd === "help" || args.help) {
    process.stdout.write(fs.readFileSync(__filename, "utf8").match(/\/\*\*[\s\S]*?\*\//)[0] + "\n");
    process.exit(cmd ? 0 : USAGE_EXIT);
  }
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(JSON.stringify({ ok: false, error: "unknown_command" }) + "\n");
    process.exit(USAGE_EXIT);
  }
  try {
    const commandFields = {
      add: ["creditor", "debtor", "promise", "due", "evidence-email-id", "key"],
      list: ["status", "max-count", "min-gap-days"], due: ["on", "max-count", "min-gap-days"],
      preflight: ["id", "max-count", "min-gap-days"],
      followup: ["id", "date", "key", "message-id", "draft-id", "note", "max-count", "min-gap-days"],
      complete: ["id", "evidence-email-id", "quote"], close: ["id", "reason"],
    };
    const permitted = new Set(["_", "file", "mailbox-id", "today", "help", ...commandFields[cmd]]);
    if (Object.keys(args).some(k => !permitted.has(k))) throw new UsageError("argument not supported for this command");
    fn(args, file);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(JSON.stringify({ ok: false, error: "usage", message: e.message }) + "\n");
      process.exit(USAGE_EXIT);
    }
    if (e instanceof RefusedError) {
      process.stderr.write(JSON.stringify({ ok: false, error: e.code, message: e.message }) + "\n");
      process.exit(REFUSED_EXIT);
    }
    process.stderr.write(JSON.stringify({ ok: false, error: "internal", message: "local ledger operation failed; stop for owner recovery" }) + "\n");
    process.exit(1);
  }
}

main();
