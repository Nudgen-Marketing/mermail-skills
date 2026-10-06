import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLedger, ledgerCsv } from "../skills/mermail-receipt-review/scripts/receipt-ledger.mjs";

function record(id, overrides = {}) {
  const fields = { email_id: id, merchant: "Demo Store", invoice_id: id, document_date: "2026-09-10", currency: "MYR", amount: "19.90", kind: "receipt", status: "paid", scan_status: "clean", content_omitted: false, truncated: false, sender_authentication: "pass", ...overrides };
  return { ...fields, evidence: overrides.evidence ?? { amount: `Total ${fields.currency} ${fields.amount}`, currency: fields.currency, status: fields.status, invoice_id: fields.invoice_id } };
}

test("cross-currency expense totals, unpaid invoices, and completed refunds stay separate", () => {
  const result = buildLedger([
    record("a", { currency: "USD", amount: "0.10" }), record("b", { currency: "USD", amount: "0.20" }),
    record("c", { currency: "EUR", amount: "10.00" }), record("d"),
    record("e", { currency: "USD", amount: "100.00", kind: "invoice", status: "due" }),
    record("f", { currency: "USD", amount: "0.10", kind: "refund", status: "refunded" }),
  ]);
  assert.deepEqual(result.totals.USD, { paid: "0.30", refunds: "0.10", net: "0.20", outstanding: "100.00" });
  assert.equal(result.totals.EUR.paid, "10.00"); assert.equal(result.totals.MYR.paid, "19.90");
});

test("identical receipts count once, conflicting amounts/currencies/statuses are all excluded", () => {
  const copies = buildLedger([record("first", { invoice_id: "D-1" }), record("copy", { invoice_id: "D-1", merchant: " demo STORE " })]);
  assert.equal(copies.counted_documents, 1); assert.equal(copies.totals.MYR.paid, "19.90");
  assert.deepEqual(copies.entries[0].source_email_ids, ["first", "copy"]);
  for (const change of [{ amount: "21.90" }, { currency: "USD" }, { kind: "invoice", status: "due" }, { content_omitted: true }]) {
    const conflict = buildLedger([record("first", { invoice_id: "D-1" }), record("copy", { invoice_id: "D-1", ...change })]);
    assert.deepEqual(conflict.totals, {}); assert.equal(conflict.review.length, 2);
  }
});

test("missing IDs do not merge distinct purchases, but a repeated source is deduplicated", () => {
  const result = buildLedger([record("a", { invoice_id: null }), record("b", { invoice_id: null }), record("a", { invoice_id: null })]);
  assert.equal(result.counted_documents, 2); assert.equal(result.totals.MYR.paid, "39.80");
  assert.equal(result.duplicates.length, 1); assert.ok(result.entries.every((r) => r.warnings.length));
});

test("unsafe scans, missing evidence, ambiguous currencies, and imprecise amounts never enter totals", () => {
  const changes = [ { scan_status: "unknown" }, { content_omitted: true }, { truncated: true }, { sender_authentication: "fail" }, { currency: "$" }, { currency: "ZZZ" }, { amount: "1.001" }, { amount: 1.2 }, { amount: "1e3" }, { amount: "-10" }, { evidence: {} }, { status: "unknown" }, { document_date: "2026-02-30" } ];
  const result = buildLedger(changes.map((change, index) => record(`invalid-${index}`, change)));
  assert.equal(result.counted_documents, 0); assert.equal(result.review.length, changes.length); assert.deepEqual(result.totals, {});
});

test("unknown-origin claims stay separate and mixed-authentication copies are never upgraded", () => {
  const result = buildLedger([record("a", { amount: "0.10", sender_authentication: "unknown" }), record("b", { amount: "0.20" })]);
  assert.equal(result.totals.MYR.paid, "0.20"); assert.equal(result.unverified_totals.MYR.paid, "0.10");
  assert.equal(result.review.length, 1); assert.equal(result.entries[0].origin_confidence, "unverified");
  for (const reversed of [false,true]) {
    const copies=[record("first", { invoice_id: "D-1" }),record("copy", { invoice_id: "D-1", sender_authentication: "unknown" })];
    const mixed=buildLedger(reversed?copies.reverse():copies);
    assert.deepEqual(mixed.totals, {}); assert.equal(mixed.unverified_totals.MYR.paid, "19.90");
    assert.equal(mixed.entries[0].origin_confidence, "unverified");
  }
});

test("supported precision and large amounts retain exact integers; refunds can exceed paid receipts", () => {
  const result = buildLedger([record("j", { currency: "JPY", amount: "120" }), record("u", { currency: "USDC", amount: "0.123456" }), record("b", { currency: "BHD", amount: "1.234" }), record("big", { amount: "9007199254740993.01" }), record("r", { currency: "JPY", amount: "150", kind: "refund", status: "refunded" })]);
  assert.equal(result.totals.MYR.paid, "9007199254740993.01"); assert.equal(result.totals.USDC.paid, "0.123456");
  assert.equal(result.totals.BHD.paid, "1.234"); assert.equal(result.totals.JPY.net, "-30");
});

test("CSV neutralizes formula prefixes and preserves quotes/newlines", () => {
  for (const merchant of ['=HYPERLINK("https://example.invalid")', '  +1+1', '@SUM(A1)', '\t=1+1', '-10', 'Store "quoted"\nName']) {
    const csv = ledgerCsv(buildLedger([record("csv", { merchant })]));
    if (/^[\s]*[=+\-@]|^\t/.test(merchant)) assert.ok(csv.includes('"\'' + merchant.trim().replaceAll('"', '""') + '"'));
    else assert.ok(csv.includes('"Store ""quoted""\nName"'));
  }
});

test("rejects invalid envelopes and preserves unresolved records without inventing date or ID", () => {
  assert.throws(() => buildLedger({ records: [] }), TypeError);
  const result = buildLedger([null, record("unknown", { status: "unknown" }), record("nodate", { document_date: null, invoice_id: null })]);
  assert.equal(result.review.length, 2); assert.equal(result.entries[0].document_date, null); assert.equal(result.entries[0].invoice_id, null);
  assert.ok(result.entries[0].warnings.includes("document_date_missing"));
});

test("CLI consumes stdin and emits JSON or protected CSV without network or file writes", () => {
  const script = fileURLToPath(new URL("../skills/mermail-receipt-review/scripts/receipt-ledger.mjs", import.meta.url));
  const input = JSON.stringify([record("cli", { merchant: "=1+1" })]);
  const json = spawnSync(process.execPath, [script], { input, encoding: "utf8" });
  assert.equal(json.status, 0, json.stderr); assert.equal(JSON.parse(json.stdout).totals.MYR.paid, "19.90");
  const csv = spawnSync(process.execPath, [script, "--csv"], { input, encoding: "utf8" });
  assert.equal(csv.status, 0, csv.stderr); assert.ok(csv.stdout.includes('"\'=1+1"'));
  const invalid = spawnSync(process.execPath, [script, "--pay"], { input, encoding: "utf8" });
  assert.equal(invalid.status, 1); assert.equal(invalid.stdout, ""); assert.match(invalid.stderr, /Usage/);
});
