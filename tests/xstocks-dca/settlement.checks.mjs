import assert from "node:assert/strict";
import { buildStatement, effectiveMultiplier, fillFromTransaction } from "../../skills/mermail-xstocks-dca/scripts/lib/settlement.mjs";
import { fill, genesis } from "./chain.mjs";
import { NVDA_MINT, SPIKE_TX, SPY_MINT, WALLET, at, mandate, spikeTx } from "./fixtures.mjs";

const SPY_SCALED = {
  decimals: 8, currentMultiplier: "1.003909240011759", newMultiplier: "1.005714560286254",
  newMultiplierEffectiveAt: "2026-06-18T04:00:00.000Z",
};

export default [
  ["the spike swap is proven from the chain, not from the model", () => {
    assert.deepEqual(fillFromTransaction(spikeTx(), { owner: WALLET, mint: SPY_MINT }), {
      ok: true, signature: SPIKE_TX, slot: 453682950, blockTime: 1791231170, amountInRaw: "250000", amountOutRaw: "31979", decimals: 8,
    });
  }],
  ["missing, failed or foreign transactions prove nothing", () => {
    assert.deepEqual(fillFromTransaction(null, { owner: WALLET, mint: SPY_MINT }), { ok: false, reason: "tx_not_found" });
    const failed = spikeTx();
    failed.meta.err = { InstructionError: [0, "Custom"] };
    assert.deepEqual(fillFromTransaction(failed, { owner: WALLET, mint: SPY_MINT }), { ok: false, reason: "tx_failed" });
    assert.deepEqual(fillFromTransaction(spikeTx(), { owner: "11111111111111111111111111111111", mint: SPY_MINT }), { ok: false, reason: "no_usdc_spent" });
    assert.deepEqual(fillFromTransaction(spikeTx(), { owner: WALLET, mint: NVDA_MINT }), { ok: false, reason: "no_asset_received" });
  }],
  ["the scaled UI multiplier switches at its effective time", () => {
    assert.equal(effectiveMultiplier(SPY_SCALED, "2026-06-18T03:59:59Z"), "1.003909240011759");
    assert.equal(effectiveMultiplier(SPY_SCALED, "2026-06-18T04:00:00Z"), "1.005714560286254");
    assert.equal(effectiveMultiplier(null, "2026-10-06T10:00:00Z"), "1");
  }],
  ["statement: multiplier-correct shares, mark prorated to the desk's own holding", () => {
    const m = mandate();
    const l = fill(fill(genesis(m), m, at(1), 0, 0, "31979"), m, at(4), 1, 0, "32010");
    const s = buildStatement({ mandate: m, ledger: l, now: at(5), marks: { [SPY_MINT]: { holdingRaw: "95968", valueUsd: "0.75", scaledUiAmount: SPY_SCALED } } });
    assert.deepEqual(s.legs[0], {
      symbol: "SPYx", mint: SPY_MINT, fills: 2, investedUsdc: "0.5", acquiredRaw: "63989", units: "0.00064354",
      multiplier: "1.005714560286254", avgCostUsd: "776.9444", valueUsd: "0.50008", pnlUsd: "0.00008", pnlPct: "0.01", flags: [],
    });
    assert.deepEqual(s.totals, { investedUsdc: "0.5", valueUsd: "0.50008", pnlUsd: "0.00008", pnlPct: "0.01" });
  }],
  ["statement never invents a mark for an asset it could not price", () => {
    const m = mandate();
    const s = buildStatement({ mandate: m, ledger: fill(genesis(m), m, at(1), 0, 1, "1430"), now: at(2), marks: {} });
    assert.equal(s.legs[1].valueUsd, null);
    assert.equal(s.legs[1].pnlUsd, null);
    assert.deepEqual(s.legs[1].flags, ["mark_unavailable"]);
    assert.equal(s.totals.valueUsd, null);
    assert.equal(s.totals.investedUsdc, "0.25");
  }],
  ["statement flags holdings that fell below what the desk bought", () => {
    const m = mandate();
    const s = buildStatement({ mandate: m, ledger: fill(genesis(m), m, at(1), 0, 0), now: at(2), marks: { [SPY_MINT]: { holdingRaw: "10000", valueUsd: "0.07", scaledUiAmount: SPY_SCALED } } });
    assert.deepEqual(s.legs[0].flags, ["holding_below_acquired"]);
    assert.equal(s.legs[0].valueUsd, "0.07");
  }],
];
