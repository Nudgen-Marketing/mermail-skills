import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "../../skills/mermail-xstocks-dca/scripts/dca.mjs";
import { mandateId, shortId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { SPIKE_TX, allVerified, at, mandate, spikeTx } from "./fixtures.mjs";

async function workspace() {
  const home = await mkdtemp(path.join(os.tmpdir(), "dca-home-"));
  const inputs = await mkdtemp(path.join(os.tmpdir(), "dca-in-"));
  const offline = async () => {
    throw new Error("network is disabled in checks");
  };
  const write = async (name, value) => {
    const file = path.join(inputs, `${name}.json`);
    await writeFile(file, JSON.stringify(value));
    return file;
  };
  const cli = (argv, { stdin = "", now = T0 } = {}) =>
    run([...argv, "--home", home], { now: () => now, stdin: async () => stdin, observeCatalog: offline, fetchTransaction: offline });
  return { home, write, cli };
}

// Desks in these checks start just before the real spike swap (2026-10-05T20:12:50Z) so the
// recorded fill can be proven from that transaction.
const T0 = "2026-10-05T20:12:30Z";
const singleLeg = () => {
  const m = mandate();
  m.legs = [m.legs[0]];
  m.cadence.anchor = "2026-10-05T20:12:00Z";
  m.validFrom = "2026-10-05T20:12:00Z";
  m.expiresAt = "2026-10-06T20:12:00Z";
  return m;
};

async function openDesk(w, m = singleLeg()) {
  const created = await w.cli(["init", "--mandate", await w.write("mandate", m)]);
  assert.equal(created.code, 0, JSON.stringify(created.output));
  return created.output.shortId;
}

async function buyFirstSlice(w, id, { slot = "0", now = T0, tx = spikeTx() } = {}) {
  const verification = await w.write("verification", allVerified());
  const planned = await w.cli(["plan", "--id", id, "--usdc-raw", "3005776", "--verification-file", verification, "--commit"], { now });
  assert.deepEqual(planned.output.actions.map((action) => action.type), ["buy"]);
  assert.equal((await w.cli(["record", "--id", id, "--kind", "intent", "--slot", slot, "--leg", "0"], { now })).code, 0);
  assert.equal((await w.cli(["record", "--id", id, "--kind", "submitted", "--slot", slot, "--leg", "0", "--request-id", `req-${slot}`], { now })).code, 0);
  return w.cli(["record", "--id", id, "--kind", "filled", "--slot", slot, "--leg", "0", "--tx", SPIKE_TX, "--tx-file", await w.write("tx", tx)], { now });
}

export default [
  ["check validates and previews without writing anything", async () => {
    const w = await workspace();
    const ok = await w.cli(["check", "--mandate", await w.write("mandate", mandate())]);
    assert.equal(ok.output.valid, true);
    assert.equal(ok.output.mandateId, mandateId(mandate()));
    assert.match(ok.output.preview, /0\.25 USDC of SPYx/);
    const bad = await w.cli(["check", "--mandate", await w.write("bad", { ...mandate(), autoRaise: true })]);
    assert.deepEqual(bad.output, { valid: false, errors: ["unknown_field:autoRaise"] });
    assert.equal((await w.cli(["status", "--id", shortId(mandateId(mandate()))])).output.error, "id_unknown");
  }],
  ["init is idempotent and starts the ledger with a genesis record", async () => {
    const w = await workspace();
    const file = await w.write("mandate", mandate());
    assert.equal((await w.cli(["init", "--mandate", file])).output.created, true);
    const again = await w.cli(["init", "--mandate", file]);
    assert.equal(again.output.created, false);
    assert.equal(again.output.entries, 1);
  }],
  ["a full tick: plan, intent, submitted, fill proven from the chain, receipt, mailed", async () => {
    const w = await workspace();
    const id = await openDesk(w);
    const filled = await buyFirstSlice(w, id);
    assert.equal(filled.code, 0, JSON.stringify(filled.output));
    assert.equal(filled.output.appended[0].data.amountOutRaw, "31979");
    const outbox = await w.cli(["outbox", "--id", id]);
    assert.equal(outbox.output.to, "owner@example.com");
    assert.equal(outbox.output.from, "desk@mermail.app");
    assert.match(outbox.output.subject, /^\[Standing Order\] Filled SPYx #/);
    assert.equal(outbox.output.throughSeq, 3);
    assert.equal((await w.cli(["mark-mailed", "--id", id, "--through", "3"])).code, 0);
    assert.deepEqual((await w.cli(["outbox", "--id", id])).output, { empty: true });
    assert.equal((await w.cli(["status", "--id", id])).output.budget.spentUsdc, "0.25");
  }],
  ["the engine refuses to record what it did not plan or cannot prove", async () => {
    const w = await workspace();
    const id = await openDesk(w);
    assert.equal((await w.cli(["record", "--id", id, "--kind", "intent", "--slot", "5", "--leg", "0"])).output.detail, "intent_refused: slot_not_current");
    assert.equal((await w.cli(["record", "--id", id, "--kind", "submitted", "--slot", "0", "--leg", "0", "--request-id", "r"])).output.error, "record_order");
    await w.cli(["record", "--id", id, "--kind", "intent", "--slot", "0", "--leg", "0"]);
    await w.cli(["record", "--id", id, "--kind", "submitted", "--slot", "0", "--leg", "0", "--request-id", "r"]);
    const foreign = spikeTx();
    foreign.meta.postTokenBalances = foreign.meta.postTokenBalances.map((row) => ({ ...row, owner: "11111111111111111111111111111111" }));
    const unproven = await w.cli(["record", "--id", id, "--kind", "filled", "--slot", "0", "--leg", "0", "--tx", SPIKE_TX, "--tx-file", await w.write("foreign", foreign)]);
    assert.equal(unproven.code, 2);
    assert.equal(unproven.output.error, "fill_unproven");
    assert.equal((await w.cli(["status", "--id", id])).output.entries, 3);
  }],
  ["an owner PAUSE from stdin halts buying until an authenticated resume", async () => {
    const w = await workspace();
    const m = singleLeg();
    const id = await openDesk(w, m);
    const emails = JSON.stringify([{ id: "e1", from: "Owner <owner@example.com>", subject: `Re: [Standing Order] Mandate active #${id}`, receivedAt: at(1), text: "PAUSE" }]);
    const controls = await w.cli(["controls", "--id", id, "--input", "-"], { stdin: emails });
    assert.deepEqual(controls.output.appended.map((entry) => entry.kind), ["control_seen", "paused"]);
    const verification = await w.write("verification", allVerified());
    assert.equal((await w.cli(["plan", "--id", id, "--usdc-raw", "3005776", "--verification-file", verification])).output.status, "paused");
    assert.equal((await w.cli(["resume", "--id", id])).output.error, "argument_required");
    assert.equal((await w.cli(["resume", "--id", id, "--user-request", "resume my standing order"])).code, 0);
    assert.equal((await w.cli(["plan", "--id", id, "--usdc-raw", "3005776", "--verification-file", verification])).output.status, "active");
  }],
  ["rebuild from the mailed receipts reproduces the ledger head", async () => {
    const w = await workspace();
    const m = singleLeg();
    const id = await openDesk(w, m);
    const ticket = (await w.cli(["outbox", "--id", id])).output;
    await w.cli(["mark-mailed", "--id", id, "--through", String(ticket.throughSeq)]);
    assert.equal((await buyFirstSlice(w, id)).code, 0);
    const receipt = (await w.cli(["outbox", "--id", id])).output;
    const mailed = [{ sender: "desk@mermail.app", folder_id: "sent", text: receipt.text }, { sender: "desk@mermail.app", folder_id: "sent", html: ticket.html }];
    const head = (await w.cli(["verify", "--id", id, "--against", await w.write("mailed", mailed)])).output;
    assert.equal(head.ok, true);
    assert.deepEqual(head.mailed, { ok: true, comparedThroughSeq: 3 });
    const other = await workspace();
    const rebuilt = await other.cli(["rebuild", "--mandate", await other.write("mandate", m), "--input", await other.write("mailed", mailed)]);
    assert.equal(rebuilt.output.ok, true);
    assert.equal(rebuilt.output.head, head.head);
  }],
  ["one transaction proves one fill, and never a fill older than its intent", async () => {
    const w = await workspace();
    const id = await openDesk(w);
    assert.equal((await buyFirstSlice(w, id)).code, 0);
    const replay = await buyFirstSlice(w, id, { slot: "1", now: "2026-10-05T20:15:30Z" });
    assert.equal(replay.code, 2);
    assert.equal(replay.output.detail, "fill_unproven: tx_already_recorded");
    const late = await workspace();
    const lateDesk = singleLeg();
    lateDesk.cadence.anchor = "2026-10-06T10:00:00Z";
    lateDesk.validFrom = "2026-10-06T10:00:00Z";
    const lateId = await openDesk(late, lateDesk);
    const stale = await buyFirstSlice(late, lateId, { now: "2026-10-06T10:00:30Z" });
    assert.equal(stale.output.detail, "fill_unproven: tx_before_intent");
  }],
  ["two ticks cannot hold the desk at once", async () => {
    const w = await workspace();
    const id = await openDesk(w);
    await writeFile(path.join(w.home, mandateId(singleLeg()), "tick.lock"), "other");
    const blocked = await w.cli(["controls", "--id", id, "--input", "-"], { stdin: "[]" });
    assert.equal(blocked.output.error, "desk_locked");
  }],
];
