#!/usr/bin/env node
/**
 * commitments.js — deterministic local ledger for mermail-commitment-keeper.
 *
 * Node 22+, zero dependencies. All dates are YYYY-MM-DD. All output is JSON.
 * Exit codes: 0 ok · 1 usage error · 2 refused / validation.
 *
 * Subcommands:
 *   add       --creditor E --debtor E --promise S --due DATE [--evidence-email-id ID]
 *             --mailbox-id ID [--key KEY] [--file P] [--today DATE]
 *   list      [--status open|fulfilled|closed|cancelled] [--mailbox-id ID] [--file P]
 *   due       [--on DATE] [--mailbox-id ID] [--file P] [--today DATE]
 *   followup  --id ID [--date DATE] [--draft-id ID] [--note S]
 *             [--max-count N] [--min-gap-days N] [--mailbox-id ID] [--file P] [--today DATE]
 *   complete  --id ID --evidence-email-id ID [--quote S] [--mailbox-id ID] [--file P] [--today DATE]
 *   close     --id ID --reason fulfilled|cancelled|waived [--mailbox-id ID] [--file P] [--today DATE]
 *
 * Invariants enforced here (the agent must respect refusals, never hand-edit the file):
 *   - add is idempotent on --key (replay returns the existing entry, created:false)
 *   - complete requires evidence email id; close:fulfilled requires prior complete
 *   - followup enforces a per-commitment count cap and minimum day gap
 *   - every entry is bound to one mailboxId; cross-mailbox operations are refused
 *   - writes are atomic (tmp file + rename); the file is the single source of truth
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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
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
  if (typeof v !== "string" || v.trim() === "" || v === true) {
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
    throw new UsageError(`--${name} must be a valid YYYY-MM-DD date, got "${v}"`);
  }
  return v;
}

function optInt(args, name, fallback) {
  const v = args[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new UsageError(`--${name} must be a non-negative integer, got "${v}"`);
  }
  return n;
}

// ---------- storage ----------

function load(file) {
  if (!fs.existsSync(file)) return { version: 1, commitments: [] };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new RefusedError("ledger_corrupt", `ledger file is not valid JSON: ${file} (${e.message})`);
  }
  if (!raw || !Array.isArray(raw.commitments)) {
    throw new RefusedError("ledger_corrupt", `ledger file has no commitments[] array: ${file}`);
  }
  return raw;
}

function save(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function newId(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `c-${h.slice(0, 8)}`;
}

function find(data, id) {
  const entry = data.commitments.find((c) => c.id === id);
  if (!entry) {
    throw new RefusedError("not_found", `no commitment with id ${id}`);
  }
  return entry;
}

function checkMailbox(entry, args) {
  const mbox = optStr(args, "mailbox-id");
  if (mbox !== null && mbox !== entry.mailboxId) {
    throw new RefusedError(
      "cross_mailbox_refused",
      `entry ${entry.id} is bound to mailbox ${entry.mailboxId}; refusing operation from mailbox ${mbox}`
    );
  }
}

function entryView(c, today) {
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
  const key = optStr(args, "key") || `add-${today}-${crypto.randomBytes(6).toString("hex")}`;
  const entry = {
    id: newId(key),
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
  const data = load(file);
  const existing = data.commitments.find((c) => c.key === key);
  if (existing) {
    emit({ ok: true, created: false, duplicate_add_ignored: true, commitment: entryView(existing, today) });
    return;
  }
  data.commitments.push(entry);
  save(file, data);
  emit({ ok: true, created: true, commitment: entryView(entry, today) });
}

function cmdList(args, file) {
  const today = optStr(args, "today") || todayISO();
  const data = load(file);
  let items = data.commitments;
  const status = optStr(args, "status");
  const mbox = optStr(args, "mailbox-id");
  if (status) {
    if (!["open", "fulfilled", "closed", "cancelled"].includes(status)) {
      throw new UsageError(`--status must be open|fulfilled|closed|cancelled`);
    }
    items = items.filter((c) => c.status === status);
  }
  if (mbox) items = items.filter((c) => c.mailboxId === mbox);
  items = items.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1));
  emit({ ok: true, today, count: items.length, commitments: items.map((c) => entryView(c, today)) });
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
  const mbox = optStr(args, "mailbox-id");
  let items = data.commitments.filter((c) => c.status === "open" && c.dueDate <= on);
  if (mbox) items = items.filter((c) => c.mailboxId === mbox);
  items = items.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1));
  emit({ ok: true, on, today: refToday, count: items.length, commitments: items.map((c) => entryView(c, refToday)) });
}

function cmdFollowup(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const data = load(file);
  const entry = find(data, reqStr(args, "id"));
  checkMailbox(entry, args);
  if (entry.status !== "open") {
    throw new RefusedError("not_open", `commitment ${entry.id} is ${entry.status}; follow-ups apply to open commitments`);
  }
  const date = optStr(args, "date") || today;
  if (!validISODate(date)) throw new UsageError(`--date must be YYYY-MM-DD`);
  const maxCount = optInt(args, "max-count", 3);
  const minGapDays = optInt(args, "min-gap-days", 3);
  if (entry.followUps.length >= maxCount) {
    throw new RefusedError(
      "followup_frequency_cap",
      `commitment ${entry.id} already has ${entry.followUps.length} follow-ups (cap ${maxCount}); report followup_capped and leave the decision to the user`
    );
  }
  const last = entry.followUps[entry.followUps.length - 1];
  if (last) {
    const gap = daysBetween(last.date, date);
    if (gap < minGapDays) {
      throw new RefusedError(
        "followup_frequency_cap",
        `last follow-up on ${last.date} is only ${gap} day(s) before ${date}; minimum gap is ${minGapDays} day(s)`
      );
    }
  }
  const rec = {
    date,
    draftId: optStr(args, "draft-id"),
    note: optStr(args, "note"),
  };
  entry.followUps.push(rec);
  save(file, data);
  emit({
    ok: true,
    recorded: true,
    commitment: {
      id: entry.id,
      followUpCount: entry.followUps.length,
      cap: maxCount,
      minGapDays,
      lastFollowUpDate: date,
      eligibleForAnother: entry.followUps.length < maxCount,
    },
  });
}

function cmdComplete(args, file) {
  const today = optStr(args, "today") || todayISO();
  if (!validISODate(today)) throw new UsageError(`--today must be YYYY-MM-DD`);
  const data = load(file);
  const entry = find(data, reqStr(args, "id"));
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
  const entry = find(data, reqStr(args, "id"));
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
  const args = parseArgs(argv.slice(1));
  const file = optStr(args, "file") || "commitments.json";
  const commands = { add: cmdAdd, list: cmdList, due: cmdDue, followup: cmdFollowup, complete: cmdComplete, close: cmdClose };

  if (!cmd || cmd === "help" || args.help) {
    process.stdout.write(fs.readFileSync(__filename, "utf8").match(/\/\*\*[\s\S]*?\*\//)[0] + "\n");
    process.exit(cmd ? 0 : USAGE_EXIT);
  }
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(JSON.stringify({ ok: false, error: "unknown_command", command: String(cmd) }) + "\n");
    process.exit(USAGE_EXIT);
  }
  try {
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
    process.stderr.write(JSON.stringify({ ok: false, error: "internal", message: e.message }) + "\n");
    process.exit(1);
  }
}

main();
