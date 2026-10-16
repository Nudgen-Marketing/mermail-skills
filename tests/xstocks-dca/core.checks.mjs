import assert from "node:assert/strict";
import {
  DcaError, canonical, formatScaled, fromBaseUnits, normalizeDecimal, parseDuration,
  parseInstant, sha256Hex, toBaseUnits, toScaled,
} from "../../skills/mermail-xstocks-dca/scripts/lib/core.mjs";

const code = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DcaError, `expected DcaError, got ${error}`);
    return error.code;
  }
  assert.fail("expected an error");
};

export default [
  ["toBaseUnits converts USDC decimals exactly", () => {
    assert.equal(toBaseUnits("0.25", 6), 250000n);
    assert.equal(toBaseUnits("1", 6), 1000000n);
    assert.equal(toBaseUnits("0.000001", 6), 1n);
  }],
  ["toBaseUnits rejects floats and malformed text", () => {
    assert.equal(code(() => toBaseUnits(0.25, 6)), "amount_not_string");
    for (const bad of ["-1", "1e3", ".5", "01", "1.", " 1", "1,5"]) {
      assert.equal(code(() => toBaseUnits(bad, 6)), "amount_malformed", bad);
    }
  }],
  ["toBaseUnits rejects more precision than the asset has", () => {
    assert.equal(code(() => toBaseUnits("0.1234567", 6)), "amount_too_precise");
  }],
  ["fromBaseUnits trims trailing zeros and keeps sign", () => {
    assert.equal(fromBaseUnits(250000n, 6), "0.25");
    assert.equal(fromBaseUnits(0n, 6), "0");
    assert.equal(fromBaseUnits(-1500000n, 6), "-1.5");
    assert.equal(fromBaseUnits("31979", 8), "0.00031979");
  }],
  ["normalizeDecimal expands exponents and truncates", () => {
    assert.equal(normalizeDecimal("2.1e-6"), "0.0000021");
    assert.equal(normalizeDecimal("779.412384385"), "779.412384385");
    assert.equal(normalizeDecimal("1e3"), "1000");
    assert.equal(normalizeDecimal(0.5), "0.5");
    assert.equal(normalizeDecimal("0.1234567890123456789999"), "0.123456789012345678");
  }],
  ["formatScaled never prints negative zero", () => {
    assert.equal(formatScaled(-toScaled("0.0000001"), 6), "0");
    assert.equal(formatScaled(toScaled("776.94449"), 4), "776.9444");
  }],
  ["canonical sorts keys at every depth and keeps array order", () => {
    assert.equal(canonical({ b: 1, a: { d: "x", c: [2, 1] } }), '{"a":{"c":[2,1],"d":"x"},"b":1}');
    assert.equal(canonical({ a: undefined, b: null }), '{"b":null}');
  }],
  ["canonical refuses floats so money cannot travel as numbers", () => {
    assert.equal(code(() => canonical({ amount: 0.25 })), "canonical_number");
    assert.equal(code(() => canonical([undefined])), "canonical_type");
  }],
  ["sha256Hex is stable", () => {
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  }],
  ["parseDuration supports days, hours and minutes", () => {
    assert.equal(parseDuration("PT3M"), 180000);
    assert.equal(parseDuration("P1D"), 86400000);
    assert.equal(parseDuration("P1DT2H"), 93600000);
    for (const bad of ["P", "PT", "PT0M", "1D", "P1W", "PT30S", 5]) {
      assert.ok(["duration_malformed", "duration_too_short"].includes(code(() => parseDuration(bad))), String(bad));
    }
  }],
  ["parseInstant requires ISO-8601 with an explicit zone", () => {
    assert.equal(parseInstant("2026-10-06T12:00:00+02:00"), parseInstant("2026-10-06T10:00:00Z"));
    assert.equal(parseInstant("2026-10-05T20:12:50.026388985Z"), Date.UTC(2026, 9, 5, 20, 12, 50, 26));
    for (const bad of ["2026-10-06 10:00", "2026-10-06T10:00:00", "yesterday", 1700000000]) {
      assert.equal(code(() => parseInstant(bad)), "instant_malformed", String(bad));
    }
  }],
];
