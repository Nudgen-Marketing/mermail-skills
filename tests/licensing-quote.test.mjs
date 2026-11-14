import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeQuote, confirmLicense, computeSplits } from "../skills/mermail-licensing-desk/scripts/quote.mjs";

const card = () => ({
  owner: "Example creator", version: "v1", currency: "USDC",
  items: { work: { title: "Example work", base: "1800", floor: "100", uses: ["sync"], exclusive_available: false } },
  multipliers: { media: { web: "1" }, territory: { us: "1" }, term: { "1y": "1" }, exclusivity: { non_exclusive: "1" } },
});
const request = { item: "work", use: "sync", media: "web", territory: "us", term: "1y", exclusivity: "non_exclusive", audience: 1 };
const payment = { paid: "1800.00", currency: "USDC", paymentRef: "owner-confirmed-example" };
const sheet = { chain: "base", asset: "USDC", decimals: 6, collaborators: [{ name: "Example", address: `0x${"1".repeat(40)}`, share_bps: 2500 }] };

test("confirmation binds price, currency, quote identity and unchanged hashed content", () => {
  const quote = computeQuote(card(), request);
  const confirmed = confirmLicense(quote, payment);
  assert.equal(confirmed.status, "licensed");
  assert.equal(confirmed.paid, "1800.00");
  assert.equal(confirmed.currency, "USDC");
  assert.deepEqual(confirmed.terms, quote.terms);
  assert.throws(() => confirmLicense({ ...quote, price: "0.01" }, { ...payment, paid: "0.01" }), /terms/);
  for (const changed of [{ ...quote, price: undefined }, { ...quote, currency: "USD" }, { ...quote, quote_id: "Q-other" }, { ...quote, terms: { ...quote.terms, territory: "worldwide" } }]) {
    assert.throws(() => confirmLicense(changed, payment));
  }
  assert.throws(() => confirmLicense(quote, { ...payment, currency: "USD" }), /currency/);
  assert.throws(() => confirmLicense(quote, { ...payment, currency: undefined }), /currency/);
  assert.throws(() => confirmLicense(quote, { ...payment, paid: "1799.99" }), /below/);
  assert.equal(confirmLicense(quote, { ...payment, paid: "1800.01" }).paid, "1800.01");
});

test("payment and split amounts reject malformed, signed, exponent, numeric and excess-precision input", () => {
  const quote = computeQuote(card(), request);
  for (const paid of ["10.0.99", "-1", "+1", "1e3", "Infinity", "NaN", " 1800", "1800.", ".01", "01", "0", 1800, "1800.001", "1".repeat(65)]) {
    assert.throws(() => confirmLicense(quote, { ...payment, paid }));
  }
  for (const amount of ["10.0.99", "-1", "+1", "1e3", "NaN", "Infinity", " 10", "10.", ".01", "01", "0", 10, "0.0000001", "1".repeat(65)]) {
    assert.throws(() => computeSplits(sheet, amount));
  }
  for (const decimals of [-1, 19, 6.5, Infinity, "6"]) assert.throws(() => computeSplits({ ...sheet, decimals }, "10"));
});

test("split arithmetic preserves exact units, zero-decimal assets and owner rounding remainder", () => {
  const result = computeSplits(sheet, "10.000001");
  assert.equal(result.payouts[0].amount_decimal, "2.5");
  assert.equal(result.owner_retains, "7.500001");
  const integer = computeSplits({ ...sheet, decimals: 0 }, "10");
  assert.equal(integer.payouts[0].amount_decimal, "2");
  assert.equal(integer.owner_retains, "8");
  const huge = computeSplits(sheet, "9007199254740993");
  assert.equal(huge.payouts[0].amount_decimal, "2251799813685248.25");
  assert.equal(huge.owner_retains, "6755399441055744.75");
});

test("pricing rounds exact decimal multipliers half up, respects floor and rejects overflow", () => {
  const rate = card(); rate.items.work.base = "1.25"; rate.items.work.floor = "0";
  rate.multipliers.media.web = "1.14";
  assert.equal(computeQuote(rate, request).price, "1.43");
  rate.items.work.floor = "2";
  assert.equal(computeQuote(rate, request).price, "2.00");
  for (const value of [Infinity, NaN, 1e20, 1.005, "1.005", "90071992547409.92"]) {
    const invalid = card(); invalid.items.work.base = value;
    assert.throws(() => computeQuote(invalid, request));
  }
  const overflow = card(); overflow.multipliers.media.web = "100000000000000";
  assert.throws(() => computeQuote(overflow, request), /range/);
  for (const factor of [Infinity, NaN, -1, 0]) {
    const invalid = card(); invalid.multipliers.audience = [{ max: null, factor }];
    assert.throws(() => computeQuote(invalid, request));
  }
});

test("large exact string rates preserve cents and numeric rate cards require explicit migration", () => {
  const exact = card(); exact.items.work.base = "90071992547409.91"; exact.items.work.floor = "0";
  assert.equal(computeQuote(exact, request).price, "90071992547409.91");
  for (const value of [1800, 1.25, 90071992547409.91]) {
    const numeric = card(); numeric.items.work.base = value;
    assert.throws(() => computeQuote(numeric, request), /exact decimal string/);
  }
  const numericFloor = card(); numericFloor.items.work.floor = 100;
  assert.throws(() => computeQuote(numericFloor, request), /exact decimal string/);
});

test("tiny exact string multipliers remain supported without exponent conversion", () => {
  const rate = card(); rate.items.work.base = "1000000"; rate.items.work.floor = "0";
  rate.multipliers.media.web = "0.0000001";
  assert.equal(computeQuote(rate, request).price, "0.10");
  rate.items.work.base = "1000000000000";
  rate.multipliers.media.web = "0.00000000000001";
  assert.equal(computeQuote(rate, request).price, "0.01");
  for (const factor of [0.0000001, "1e-7", "0.0000000000000000001", "0", "-0.1", "1.0.1"]) {
    rate.multipliers.media.web = factor;
    assert.throws(() => computeQuote(rate, request));
  }
});

test("actual CLI rejects rounded raw JSON numeric token and accepts its exact string replacement", () => {
  const directory = mkdtempSync(join(tmpdir(), "licensing-quote-regression-"));
  try {
    const script = fileURLToPath(new URL("../skills/mermail-licensing-desk/scripts/quote.mjs", import.meta.url));
    const ratePath = join(directory, "rate-card.json"), requestPath = join(directory, "request.json");
    const exact = card(); exact.items.work.base = "90071992547409.91"; exact.items.work.floor = "0";
    const exactJson = JSON.stringify(exact);
    writeFileSync(requestPath, JSON.stringify(request));
    // Preserve the literal JSON token: constructing a JS Number first would hide
    // the pre-validation loss being tested.
    writeFileSync(ratePath, exactJson.replace('"base":"90071992547409.91"', '"base":90071992547409.91'));
    const run = () => spawnSync(process.execPath, [script, "--rate-card", ratePath, "--request", requestPath], { cwd: directory, encoding: "utf8" });
    const numeric = run();
    assert.equal(numeric.status, 2, numeric.stderr);
    assert.equal(JSON.parse(numeric.stdout).status, "bad_rate_card");
    assert.match(JSON.parse(numeric.stdout).message, /original owner record/);
    writeFileSync(ratePath, exactJson);
    const accepted = run();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).price, "90071992547409.91");
    exact.items.work.base = "1000000"; exact.multipliers.media.web = "0.0000001";
    writeFileSync(ratePath, JSON.stringify(exact));
    const tiny = run();
    assert.equal(tiny.status, 0, tiny.stderr);
    assert.equal(JSON.parse(tiny.stdout).price, "0.10");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("conflicting or unavailable terms cannot produce a quote", () => {
  assert.throws(() => computeQuote(card(), { ...request, use: "merch" }));
  assert.throws(() => computeQuote(card(), { ...request, exclusivity: "exclusive" }));
  assert.throws(() => computeQuote(card(), { ...request, term: ["1y", "3y"] }));
  assert.throws(() => computeQuote(card(), { ...request, audience: Number.MAX_SAFE_INTEGER + 1 }));
  const unavailable = card(); unavailable.multipliers.media.web = null;
  assert.throws(() => computeQuote(unavailable, request));
});

test("owner exact-string rate card retains the ordinary quote-confirm-split workflow", () => {
  const rate = card(); rate.items.work.base = "750"; rate.items.work.floor = "500";
  rate.multipliers.media.web = "1.5";
  rate.multipliers.territory.us = "1.25";
  rate.multipliers.term["1y"] = "1.6";
  rate.multipliers.audience = [{ max: 1000000, factor: "1.5" }, { max: null, factor: "2.5" }];
  rate.rush = { days_under: 7, factor: "1.25" };
  const quote = computeQuote(rate, { ...request, audience: 50000, deadline_days: 5 });
  assert.equal(quote.price, "4218.75");
  assert.equal(confirmLicense(quote, { ...payment, paid: "4218.75" }).status, "licensed");
  const result = computeSplits(sheet, "4000.000001");
  assert.equal(result.payouts[0].amount_decimal, "1000");
  assert.equal(result.owner_retains, "3000.000001");
});
