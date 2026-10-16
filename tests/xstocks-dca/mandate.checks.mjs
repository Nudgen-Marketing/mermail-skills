import assert from "node:assert/strict";
import { DcaError } from "../../skills/mermail-xstocks-dca/scripts/lib/core.mjs";
import { USDC_MINT, assertMandate, mandateId, shortId, validateMandate } from "../../skills/mermail-xstocks-dca/scripts/lib/mandate.mjs";
import { SPY_MINT, mandate } from "./fixtures.mjs";

const reorder = (value) => {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reorder(inner)]));
  }
  return value;
};

export default [
  ["the reference mandate is valid", () => {
    assert.deepEqual(validateMandate(mandate()), []);
  }],
  ["the mandate id ignores key order (a human re-saving the file)", () => {
    const m = mandate();
    assert.equal(mandateId(reorder(m)), mandateId(m));
    assert.match(shortId(mandateId(m)), /^[0-9a-f]{8}$/);
  }],
  ["any value change produces a different mandate id", () => {
    const raised = mandate();
    raised.caps.totalUsdc = "200.00";
    assert.notEqual(mandateId(raised), mandateId(mandate()));
  }],
  ["unknown top-level fields are rejected", () => {
    assert.deepEqual(validateMandate({ ...mandate(), autoRaise: true }), ["unknown_field:autoRaise"]);
  }],
  ["a slice above the per-slice cap is rejected", () => {
    const m = mandate();
    m.legs[0].sliceUsdc = "0.75";
    assert.ok(validateMandate(m).includes("slice_over_cap:0"));
  }],
  ["duplicate mints and USDC as an asset are rejected", () => {
    const duplicate = mandate();
    duplicate.legs[1].mint = SPY_MINT;
    assert.ok(validateMandate(duplicate).includes("duplicate_mint"));
    const usdc = mandate();
    usdc.legs[0].mint = USDC_MINT;
    assert.ok(validateMandate(usdc).includes("leg_mint:0"));
  }],
  ["money given as a JSON number is rejected", () => {
    const m = mandate();
    m.legs[0].sliceUsdc = 0.25;
    assert.ok(validateMandate(m).includes("leg_slice:0"));
  }],
  ["cap relationships are enforced", () => {
    const window = mandate();
    window.caps.window.maxUsdc = "3.00";
    assert.ok(validateMandate(window).includes("window_over_total"));
    const tick = mandate();
    tick.caps.window.maxUsdc = "0.40";
    assert.ok(validateMandate(tick).includes("tick_over_window"));
  }],
  ["validity, slippage and wallet network are checked", () => {
    const validity = mandate();
    validity.expiresAt = validity.validFrom;
    assert.ok(validateMandate(validity).includes("validity"));
    for (const bps of [0, 1001, 1.5, "100"]) {
      const slippage = mandate();
      slippage.guards.maxSlippageBps = bps;
      assert.ok(validateMandate(slippage).includes("slippage"), String(bps));
    }
    const network = mandate();
    network.wallet.network = "base";
    assert.ok(validateMandate(network).includes("wallet"));
  }],
  ["assertMandate throws one coded error listing every problem", () => {
    const m = mandate();
    m.schema = "other";
    m.owner.email = "nope";
    assert.throws(() => assertMandate(m), (error) => error instanceof DcaError
      && error.code === "mandate_invalid" && error.message.includes("schema") && error.message.includes("owner_email"));
  }],
];
