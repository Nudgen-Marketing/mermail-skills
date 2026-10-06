import assert from "node:assert/strict";
import { parseInstant } from "../../skills/mermail-xstocks-dca/scripts/lib/core.mjs";
import { mandateId, shortId } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { budgetOf, deriveState, intentAllowed, plan, slotAt } from "../../skills/mermail-xstocks-dca/scripts/lib/planner.mjs";
import { fill, genesis, push } from "./chain.mjs";
import { NVDA_MINT, SPY_MINT, allVerified, at, mandate, verified } from "./fixtures.mjs";

const FUNDED = () => ({ verification: allVerified(), usdcRaw: "5000000" });
const run = (m, l, now, observations = FUNDED()) => plan({ mandate: m, ledger: l, now, observations });
const buys = (p) => p.actions.filter((action) => action.type === "buy");
const refusals = (p) => p.records.filter((record) => record.kind === "refused").map((record) => `${record.leg}:${record.data.reason}`);
const fillAll = (m, pairs) => pairs.reduce((l, [slot, leg]) => fill(l, m, at(slot * 3 + 1), slot, leg), genesis(m));

export default [
  ["nothing happens before validFrom or before the first slot", () => {
    const m = mandate();
    assert.equal(run(m, genesis(m), "2026-10-06T09:59:00Z").status, "not_started");
    const early = mandate();
    early.validFrom = "2026-10-06T09:00:00Z";
    const p = run(early, genesis(early), "2026-10-06T09:59:00Z");
    assert.equal(p.status, "waiting");
    assert.deepEqual(p.actions, []);
  }],
  ["the first slot buys every leg with exact base units and the slippage guard", () => {
    const m = mandate();
    const tag = shortId(mandateId(m));
    const p = run(m, genesis(m), at(1));
    assert.equal(p.slot, 0);
    assert.deepEqual(buys(p), [
      { type: "buy", slot: 0, leg: 0, symbol: "SPYx", mint: SPY_MINT, amountRaw: "250000", slippageBps: 100, slotKey: `${tag}:0:0` },
      { type: "buy", slot: 0, leg: 1, symbol: "NVDAx", mint: NVDA_MINT, amountRaw: "250000", slippageBps: 100, slotKey: `${tag}:0:1` },
    ]);
  }],
  ["a second tick in the same slot buys nothing and records nothing", () => {
    const m = mandate();
    const p = run(m, fillAll(m, [[0, 0], [0, 1]]), at(2));
    assert.equal(p.status, "active");
    assert.deepEqual(buys(p), []);
    assert.deepEqual(p.records, []);
  }],
  ["missed slots are never bought in a burst", () => {
    const m = mandate();
    const p = run(m, fillAll(m, [[0, 0]]), at(16));
    assert.equal(p.slot, 5);
    assert.deepEqual(buys(p).map((buy) => `${buy.slot}:${buy.leg}`), ["5:0", "5:1"]);
  }],
  ["an unresolved submission blocks new buys and asks for reconciliation", () => {
    const m = mandate();
    let l = push(genesis(m), at(1), "intent", 0, 0, { amountInRaw: "250000" });
    l = push(l, at(1), "submitted", 0, 0, { requestId: "req-1" });
    const p = run(m, l, at(4));
    assert.equal(p.status, "reconciling");
    assert.deepEqual(p.actions, [{ type: "reconcile", slot: 0, leg: 0, requestId: "req-1" }]);
  }],
  ["a fresh intent belongs to a tick still in flight: no records, no buys", () => {
    const m = mandate();
    const p = run(m, push(genesis(m), at(1), "intent", 0, 0, { amountInRaw: "250000" }), at(4));
    assert.equal(p.status, "in_progress");
    assert.deepEqual(p.records, []);
    assert.deepEqual(p.actions, []);
  }],
  ["refill actions carry the shortfall in USDC for the bridge quote", () => {
    const m = mandate();
    const p = run(m, genesis(m), at(1), { verification: allVerified(), usdcRaw: "300000" });
    assert.equal(p.actions.find((action) => action.type === "refill").shortfallUsdc, "0.2");
  }],
  ["an intent without a request id becomes uncertain, never a retry", () => {
    const m = mandate();
    const p = run(m, push(genesis(m), at(1), "intent", 0, 0, { amountInRaw: "250000" }), at(15));
    assert.deepEqual(p.records, [{ kind: "uncertain", slot: 0, leg: 0, data: { reason: "intent_without_request", amountInRaw: "250000" } }]);
    assert.deepEqual(buys(p), []);
  }],
  ["the rolling window refuses the slice that would overflow it", () => {
    const m = mandate();
    const p = run(m, fillAll(m, [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]), at(10));
    assert.deepEqual(buys(p).map((buy) => buy.leg), [0]);
    assert.deepEqual(refusals(p), ["1:cap_window"]);
  }],
  ["an uncertain slice stays counted against the budget", () => {
    const m = mandate();
    m.caps.totalUsdc = "0.75";
    m.caps.window.maxUsdc = "0.75";
    let l = push(genesis(m), at(1), "intent", 0, 0, { amountInRaw: "250000" });
    l = push(l, at(1), "uncertain", 0, 0, { reason: "intent_without_request", amountInRaw: "250000" });
    l = fill(l, m, at(1), 0, 1);
    const p = run(m, l, at(4));
    assert.deepEqual(buys(p).map((buy) => buy.leg), [0]);
    assert.deepEqual(refusals(p), ["1:cap_total"]);
    assert.equal(p.budget.inflightUsdc, "0.25");
  }],
  ["the total cap refuses, then the desk reports itself exhausted once", () => {
    const m = mandate();
    m.caps.totalUsdc = "1.00";
    m.caps.window.maxUsdc = "1.00";
    let l = fillAll(m, [[0, 0], [0, 1], [1, 0]]);
    const p = run(m, l, at(7));
    assert.deepEqual(buys(p).map((buy) => buy.leg), [0]);
    assert.deepEqual(refusals(p), ["1:cap_total"]);
    l = fill(l, m, at(7), 2, 0);
    const done = run(m, l, at(10));
    assert.equal(done.status, "exhausted");
    assert.deepEqual(done.records, [{ kind: "skipped", slot: null, leg: null, data: { reason: "exhausted" } }]);
    assert.deepEqual(run(m, push(l, at(10), "skipped", null, null, { reason: "exhausted" }), at(13)).records, []);
  }],
  ["the catalog decides: mismatch, unverified, halted or missing data refuses", () => {
    const m = mandate();
    const cases = [
      [verified("8jKpS1vXNiPxYf3BiGcosdNN6WavCfMUf31fHihfjups"), "0:mint_mismatch"],
      [verified(SPY_MINT, { status: "unknown" }), "0:unverified"],
      [verified(SPY_MINT, { identityVerified: false }), "0:unverified"],
      [verified(SPY_MINT, { halted: true }), "0:halted"],
      [{ status: "verified", mint: SPY_MINT, identityVerified: true }, "0:halted"],
    ];
    for (const [observation, expected] of cases) {
      const p = run(m, genesis(m), at(1), { verification: { [SPY_MINT]: observation, [NVDA_MINT]: verified(NVDA_MINT) }, usdcRaw: "5000000" });
      assert.deepEqual(refusals(p), [expected]);
      assert.deepEqual(buys(p).map((buy) => buy.leg), [1]);
    }
    assert.deepEqual(refusals(run(m, genesis(m), at(1), { verification: {}, usdcRaw: "5000000" })),
      ["0:verification_unavailable", "1:verification_unavailable"]);
  }],
  ["short funds buy what fits and request a refill for the rest", () => {
    const m = mandate();
    const p = run(m, genesis(m), at(1), { verification: allVerified(), usdcRaw: "300000" });
    assert.deepEqual(buys(p).map((buy) => buy.leg), [0]);
    assert.deepEqual(p.records, [{ kind: "refused", slot: 0, leg: 1, data: { reason: "insufficient_funds", shortfallRaw: "200000" } }]);
    assert.deepEqual(p.actions.filter((action) => action.type === "refill"), [{ type: "refill", slot: 0, leg: 1, shortfallRaw: "200000", shortfallUsdc: "0.2" }]);
    assert.deepEqual(refusals(run(m, genesis(m), at(1), { verification: allVerified() })),
      ["0:balance_unavailable", "1:balance_unavailable"]);
  }],
  ["paused, revoked and expired desks never buy", () => {
    const m = mandate();
    for (const kind of ["paused", "revoked"]) {
      const p = run(m, push(genesis(m), at(0), kind, null, null, { by: "email" }), at(1));
      assert.equal(p.status, kind);
      assert.deepEqual(p.actions, []);
      assert.deepEqual(p.records, []);
    }
    const expired = run(m, genesis(m), "2026-10-07T10:00:00Z");
    assert.equal(expired.status, "expired");
    assert.deepEqual(expired.records, [{ kind: "skipped", slot: null, leg: null, data: { reason: "expired" } }]);
  }],
  ["a refusal is recorded once per slot, not on every tick", () => {
    const m = mandate();
    const observations = { verification: { [SPY_MINT]: verified(SPY_MINT, { halted: true }), [NVDA_MINT]: verified(NVDA_MINT) }, usdcRaw: "5000000" };
    const first = run(m, genesis(m), at(1), observations);
    const l = first.records.reduce((ledger, record) => push(ledger, at(1), record.kind, record.slot, record.leg, record.data), genesis(m));
    assert.deepEqual(run(m, l, at(2), observations).records, []);
    assert.deepEqual(refusals(run(m, l, at(4), observations)), ["0:halted"]);
  }],
  ["a broken chain halts the desk", () => {
    const m = mandate();
    const l = structuredClone(fillAll(m, [[0, 0]]));
    l[2].data.requestId = "tampered";
    const p = run(m, l, at(4));
    assert.equal(p.status, "integrity_failed");
    assert.deepEqual(p.actions, [{ type: "halt", reason: "integrity_hash", seq: 2 }]);
  }],
  ["a timezone offset lands in the same slot as UTC", () => {
    const m = mandate();
    assert.equal(slotAt(m, parseInstant("2026-10-06T12:03:30+02:00")), slotAt(m, parseInstant(at(3.5))));
    assert.equal(run(m, genesis(m), "2026-10-06T12:03:30+02:00").slot, 1);
  }],
  ["statements fall due after the first fill and then every statementEvery", () => {
    const m = mandate();
    assert.equal(run(m, genesis(m), at(1)).statementDue, false);
    const l = fillAll(m, [[0, 0]]);
    assert.equal(run(m, l, at(2)).statementDue, true);
    const issued = push(l, at(2), "statement", null, null, { asOf: at(2) });
    assert.equal(run(m, issued, at(10)).statementDue, false);
    assert.equal(run(m, issued, at(17)).statementDue, true);
  }],
  ["intentAllowed re-checks state, open orders, slot and caps at record time", () => {
    const m = mandate();
    const l = genesis(m);
    assert.equal(intentAllowed(m, l, parseInstant(at(1)), 0, 0), null);
    assert.equal(intentAllowed(m, l, parseInstant(at(1)), 1, 0), "slot_not_current");
    assert.equal(intentAllowed(m, fill(l, m, at(1), 0, 0), parseInstant(at(2)), 0, 0), "slot_done");
    const pending = push(push(l, at(1), "intent", 0, 0, { amountInRaw: "250000" }), at(1), "submitted", 0, 0, { requestId: "r" });
    assert.equal(intentAllowed(m, pending, parseInstant(at(1)), 0, 1), "unresolved_order");
    const tight = mandate();
    tight.legs = [tight.legs[0]];
    tight.caps.totalUsdc = "0.25";
    tight.caps.window.maxUsdc = "0.25";
    assert.equal(intentAllowed(tight, fill(genesis(tight), tight, at(1), 0, 0), parseInstant(at(4)), 1, 0), "exhausted");
  }],
  ["budget is reported in USDC strings", () => {
    const m = mandate();
    assert.deepEqual(budgetOf(deriveState(m, fillAll(m, [[0, 0]]), parseInstant(at(2)))), {
      spentUsdc: "0.25", inflightUsdc: "0", windowCommittedUsdc: "0.25", windowRemainingUsdc: "1.25", totalRemainingUsdc: "1.75",
    });
  }],
];
