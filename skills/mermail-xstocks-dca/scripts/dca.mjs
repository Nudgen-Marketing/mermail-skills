#!/usr/bin/env node
// Standing Order engine: every money decision for the mermail-xstocks-dca skill.
// Output is always JSON. Commands and flags are documented in references/tools.md.
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { evaluateControls } from "./lib/controls.mjs";
import { DcaError, parseInstant } from "./lib/core.mjs";
import { appendEntry, blocksFromEmails, compareLedgers, rebuildLedger, verifyChain } from "./lib/ledger.mjs";
import { assertMandate, mandateId, shortId, usdcUnits, validateMandate } from "./lib/mandate.mjs";
import { fetchTransaction, observeCatalog } from "./lib/network.mjs";
import { budgetOf, deriveState, intentAllowed, plan } from "./lib/planner.mjs";
import { describeMandate, renderEmail } from "./lib/render.mjs";
import { buildStatement, fillFromTransaction, marksFromPortfolio, usdcFromPortfolio } from "./lib/settlement.mjs";
import { createDesk, findDesk, readDesk, resolveHome, withLock, writeLedger, writeState } from "./lib/store.mjs";

// Block time and the local clock can disagree by a little; two minutes is generous for Solana.
const FILL_CLOCK_SKEW_MS = 120_000;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new DcaError("argument_unexpected", token);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[token.slice(2)] = true;
    } else {
      flags[token.slice(2)] = next;
      index += 1;
    }
  }
  return { command, flags };
}

const required = (value, name) => {
  if (typeof value !== "string" || value.length === 0) throw new DcaError("argument_required", name);
  return value;
};
const integer = (value, name) => {
  if (!/^\d+$/.test(String(value))) throw new DcaError("argument_integer", name);
  return Number(value);
};

async function readJson(source, io) {
  const text = required(source, "input") === "-" ? await io.stdin() : await readFile(source, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new DcaError("input_not_json", source);
  }
}

function nowOf(flags, io) {
  const now = typeof flags.now === "string" ? flags.now : io.now();
  parseInstant(now);
  return now;
}

const deskDir = (flags) => findDesk(resolveHome(flags.home), flags.id);

// Every write goes through here: one lock, an integrity check, deterministic records, one save.
async function mutate(flags, io, build) {
  const dir = await deskDir(flags);
  const now = nowOf(flags, io);
  return withLock(dir, async () => {
    const desk = await readDesk(dir);
    const integrity = verifyChain(desk.ledger, mandateId(desk.mandate));
    if (!integrity.ok) throw new DcaError("integrity_failed", `${integrity.reason}@${integrity.seq}`);
    const { records = [], result = {} } = await build(desk, now);
    let ledger = desk.ledger;
    const appended = [];
    for (const record of records) {
      const step = appendEntry(ledger, { at: now, ...record });
      ledger = step.ledger;
      appended.push(step.entry);
    }
    if (appended.length) await writeLedger(dir, ledger);
    return { ...result, appended };
  });
}

const COMMANDS = {
  async check(flags, io) {
    const mandate = await readJson(flags.mandate, io);
    const errors = validateMandate(mandate);
    if (errors.length) return { valid: false, errors };
    const id = mandateId(mandate);
    return { valid: true, mandateId: id, shortId: shortId(id), preview: describeMandate(mandate) };
  },

  async init(flags, io) {
    const mandate = await readJson(flags.mandate, io);
    const id = assertMandate(mandate);
    const dir = path.join(resolveHome(flags.home), id);
    try {
      const existing = await readDesk(dir);
      return { created: false, mandateId: id, shortId: shortId(id), dir, entries: existing.ledger.length };
    } catch {
      // new desk
    }
    // The genesis record carries the mandate itself, so the mailed ticket alone can restore a desk.
    const { ledger } = appendEntry([], { at: nowOf(flags, io), kind: "genesis", data: { mandateId: id, mandate } });
    await createDesk(dir, mandate, ledger, { mailedThroughSeq: -1 });
    return { created: true, mandateId: id, shortId: shortId(id), dir };
  },

  async controls(flags, io) {
    const emails = await readJson(flags.input, io);
    if (!Array.isArray(emails)) throw new DcaError("input_not_array", "controls");
    return mutate(flags, io, (desk) => ({ records: evaluateControls(desk.mandate, desk.ledger, emails) }));
  },

  async plan(flags, io) {
    const dir = await deskDir(flags);
    const now = nowOf(flags, io);
    const peek = await readDesk(dir);
    const verification = typeof flags["verification-file"] === "string"
      ? await readJson(flags["verification-file"], io)
      : await io.observeCatalog(peek.mandate);
    let usdcRaw = null;
    if (typeof flags.portfolio === "string") usdcRaw = usdcFromPortfolio(await readJson(flags.portfolio, io), peek.mandate.wallet.address);
    else if (flags["usdc-raw"] !== undefined) usdcRaw = String(integer(flags["usdc-raw"], "usdc-raw"));
    const decide = (desk) => plan({ mandate: desk.mandate, ledger: desk.ledger, now, observations: { verification, usdcRaw } });
    if (!flags.commit) return decide(peek);
    return mutate(flags, io, (desk) => {
      const result = decide(desk);
      return { records: result.records, result };
    });
  },

  async record(flags, io) {
    const kind = flags.kind;
    if (!["intent", "submitted", "filled", "failed"].includes(kind)) throw new DcaError("record_kind", String(kind));
    const slot = integer(flags.slot, "slot");
    const leg = integer(flags.leg, "leg");
    let proof = null;
    if (kind === "filled") {
      const { mandate } = await readDesk(await deskDir(flags));
      const legSpec = mandate.legs[leg];
      if (!legSpec) throw new DcaError("leg_unknown", String(leg));
      const signature = required(flags.tx, "tx");
      const tx = typeof flags["tx-file"] === "string" ? await readJson(flags["tx-file"], io) : await io.fetchTransaction(signature);
      proof = fillFromTransaction(tx, { owner: mandate.wallet.address, mint: legSpec.mint });
      if (!proof.ok) throw new DcaError("fill_unproven", proof.reason);
      if (proof.signature !== signature) throw new DcaError("fill_unproven", "signature_mismatch");
    }
    return mutate(flags, io, (desk, now) => {
      const legSpec = desk.mandate.legs[leg];
      if (!legSpec) throw new DcaError("leg_unknown", String(leg));
      const nowMs = parseInstant(now);
      const current = deriveState(desk.mandate, desk.ledger, nowMs).slots.get(`${slot}:${leg}`)?.status ?? null;
      const allowedAfter = { intent: [null], submitted: ["intent"], filled: ["submitted"], failed: ["intent", "submitted"] }[kind];
      if (!allowedAfter.includes(current)) throw new DcaError("record_order", `${kind} after ${current ?? "nothing"}`);
      if (kind === "intent") {
        const denial = intentAllowed(desk.mandate, desk.ledger, nowMs, slot, leg);
        if (denial) throw new DcaError("intent_refused", denial);
      }
      if (kind === "filled") {
        // One transaction proves one fill, and it must not predate the intent it settles.
        if (desk.ledger.some((entry) => entry.kind === "filled" && entry.data.tx === proof.signature)) {
          throw new DcaError("fill_unproven", "tx_already_recorded");
        }
        const intentAtMs = deriveState(desk.mandate, desk.ledger, nowMs).slots.get(`${slot}:${leg}`).committedAtMs;
        if (!Number.isInteger(proof.blockTime)) throw new DcaError("fill_unproven", "tx_time_unknown");
        if (proof.blockTime * 1000 < intentAtMs - FILL_CLOCK_SKEW_MS) throw new DcaError("fill_unproven", "tx_before_intent");
      }
      const data = {
        intent: () => ({ amountInRaw: String(usdcUnits(legSpec.sliceUsdc)), mint: legSpec.mint, symbol: legSpec.symbol }),
        submitted: () => ({ requestId: required(flags["request-id"], "request-id") }),
        filled: () => ({
          tx: proof.signature, amountInRaw: proof.amountInRaw, amountOutRaw: proof.amountOutRaw, decimals: proof.decimals,
          blockTime: proof.blockTime, mint: legSpec.mint, symbol: legSpec.symbol,
        }),
        failed: () => ({ reason: required(flags.reason, "reason").slice(0, 300) }),
      }[kind]();
      return { records: [{ kind, slot, leg, data }] };
    });
  },

  async outbox(flags, io) {
    const desk = await readDesk(await deskDir(flags));
    const pending = desk.ledger.filter((entry) => entry.seq > desk.state.mailedThroughSeq);
    if (!pending.length) return { empty: true };
    const budget = budgetOf(deriveState(desk.mandate, desk.ledger, parseInstant(nowOf(flags, io))));
    return {
      empty: false,
      to: desk.mandate.owner.email,
      from: desk.mandate.mailbox.email,
      mailboxId: desk.mandate.mailbox.publicId,
      throughSeq: pending.at(-1).seq,
      ...renderEmail({ mandate: desk.mandate, entries: pending, budget }),
    };
  },

  async "mark-mailed"(flags) {
    const dir = await deskDir(flags);
    const through = integer(flags.through, "through");
    return withLock(dir, async () => {
      const desk = await readDesk(dir);
      if (through >= desk.ledger.length) throw new DcaError("through_out_of_range", String(through));
      const mailedThroughSeq = Math.max(desk.state.mailedThroughSeq, through);
      await writeState(dir, { ...desk.state, mailedThroughSeq });
      return { mailedThroughSeq };
    });
  },

  async statement(flags, io) {
    let marks;
    if (typeof flags.portfolio === "string") {
      // Holdings come from paybox_get_portfolio verbatim; the multiplier from the live catalog.
      const { mandate } = await readDesk(await deskDir(flags));
      const portfolio = await readJson(flags.portfolio, io);
      const verification = typeof flags["verification-file"] === "string"
        ? await readJson(flags["verification-file"], io)
        : await io.observeCatalog(mandate);
      const mints = mandate.legs.map((leg) => leg.mint);
      marks = marksFromPortfolio(portfolio, mandate.wallet.address, mints);
      for (const mint of mints) marks[mint].scaledUiAmount = verification[mint]?.scaledUiAmount ?? null;
    } else {
      marks = await readJson(flags.marks, io);
    }
    return mutate(flags, io, (desk, now) => {
      const statement = buildStatement({ mandate: desk.mandate, ledger: desk.ledger, now, marks });
      return { records: [{ kind: "statement", data: statement }], result: { statement } };
    });
  },

  async status(flags, io) {
    const desk = await readDesk(await deskDir(flags));
    const now = nowOf(flags, io);
    const state = deriveState(desk.mandate, desk.ledger, parseInstant(now));
    return {
      mandateId: mandateId(desk.mandate),
      status: state.status,
      budget: budgetOf(state),
      entries: desk.ledger.length,
      mailedThroughSeq: desk.state.mailedThroughSeq,
      integrity: verifyChain(desk.ledger, mandateId(desk.mandate)),
      recent: desk.ledger.slice(-5).map(({ seq, at, kind, slot, leg, data }) => ({ seq, at, kind, slot, leg, reason: data.reason ?? null })),
    };
  },

  async verify(flags, io) {
    const desk = await readDesk(await deskDir(flags));
    const verdict = verifyChain(desk.ledger, mandateId(desk.mandate));
    if (typeof flags.against !== "string") return verdict;
    return { ...verdict, mailed: compareLedgers(desk.ledger, blocksFromEmails(await readJson(flags.against, io), { from: desk.mandate.mailbox.email, folder: "sent" })) };
  },

  async rebuild(flags, io) {
    const emails = await readJson(flags.input, io);
    if (!Array.isArray(emails)) throw new DcaError("input_not_array", "rebuild");
    let mandate = typeof flags.mandate === "string" ? await readJson(flags.mandate, io) : null;
    if (!mandate) {
      const ticket = blocksFromEmails(emails, { folder: "sent" }).find((block) => block?.seq === 0 && block?.kind === "genesis");
      mandate = ticket?.data?.mandate;
      if (!mandate) throw new DcaError("mandate_not_found", "no mandate ticket among the Sent messages");
    }
    const id = assertMandate(mandate);
    const result = rebuildLedger(blocksFromEmails(emails, { from: mandate.mailbox.email, folder: "sent" }), id);
    if (!result.ok) return result;
    const dir = path.join(resolveHome(flags.home), id);
    let exists = true;
    try {
      await readDesk(dir);
    } catch {
      exists = false;
    }
    if (exists) throw new DcaError("desk_exists", dir);
    await createDesk(dir, mandate, result.ledger, { mailedThroughSeq: result.ledger.at(-1).seq });
    return { ok: true, mandateId: id, entries: result.ledger.length, head: result.ledger.at(-1).hash, dir };
  },

  async resume(flags, io) {
    const request = required(flags["user-request"], "user-request");
    return mutate(flags, io, (desk, now) => {
      const status = deriveState(desk.mandate, desk.ledger, parseInstant(now)).status;
      if (status !== "paused") throw new DcaError("not_paused", status);
      return { records: [{ kind: "resumed", data: { by: "user_session", request: request.slice(0, 300) } }] };
    });
  },

  async revoke(flags, io) {
    const request = required(flags["user-request"], "user-request");
    return mutate(flags, io, (desk, now) => {
      const status = deriveState(desk.mandate, desk.ledger, parseInstant(now)).status;
      if (status === "revoked") throw new DcaError("already_revoked");
      return { records: [{ kind: "revoked", data: { by: "user_session", request: request.slice(0, 300) } }] };
    });
  },
};

export async function run(argv, io = defaultIo()) {
  try {
    const { command, flags } = parseArgs(argv);
    const handler = COMMANDS[command];
    if (!handler) throw new DcaError("command_unknown", String(command));
    return { code: 0, output: await handler(flags, io) };
  } catch (error) {
    if (error instanceof DcaError) return { code: 2, output: { error: error.code, detail: error.message } };
    return { code: 1, output: { error: "internal", detail: error.message } };
  }
}

function defaultIo() {
  return {
    now: () => new Date().toISOString(),
    stdin: async () => {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      return Buffer.concat(chunks).toString("utf8");
    },
    observeCatalog,
    fetchTransaction,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { code, output } = await run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = code;
}
