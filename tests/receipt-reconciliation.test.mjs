import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { reconcile, renderMarkdown } from "../skills/mermail-reconcile-receipts/scripts/reconcile.mjs";

function event(overrides = {}) {
  return {
    email_id: "email-1", document_id: "INV-1", merchant_id: "vendor.example",
    invoice_id: "INV-1", event_type: "invoice", currency: "USD", amount: "100.00",
    scan_status: "clean", sender_authentication: "pass", status: "confirmed",
    evidence: "Synthetic invoice INV-1, total USD 100.00", ...overrides,
  };
}
function input(events, scope = {}) {
  return {
    schema_version: 1,
    scope: { mailbox_id: "synthetic-mailbox", date_start: "2026-09-01T00:00:00Z", date_end: "2026-09-30T23:59:59Z", coverage: "Synthetic offline fixture; not live MCP evidence.", ...scope },
    events,
  };
}
const receipt = (overrides = {}) => event({ email_id: "email-2", document_id: "PAY-1", event_type: "payment_receipt", amount: "80", ...overrides });

test("partial receipt plus credit note balances an invoice exactly", () => {
  const report = reconcile(input([event(), receipt(), event({ email_id: "email-3", document_id: "CR-1", event_type: "credit_note", amount: "20" })]));
  assert.equal(report.rows[0].reported_balance, "0");
  assert.equal(report.rows[0].status, "balanced_within_evidence");
  assert.equal(report.rows[0].documents.length, 3);
});

test("duplicate document in a forwarded message counts once and keeps both sources", () => {
  const report = reconcile(input([event(), receipt(), receipt({ email_id: "forwarded-email", amount: "80.000000" })]));
  assert.equal(report.duplicate_copies_ignored, 1);
  assert.equal(report.rows[0].reported_paid, "80");
  assert.equal(report.rows[0].reported_balance, "20");
  assert.deepEqual(report.rows[0].documents[1].sources.map((source) => source.email_id), ["email-2", "forwarded-email"]);
});

test("conflicting duplicate amounts exclude every copy and taint the invoice", () => {
  const report = reconcile(input([event(), receipt(), receipt({ email_id: "conflict-email", amount: "90" })]));
  assert.equal(report.rows[0].reported_paid, "0");
  assert.equal(report.rows[0].status, "review_required");
  assert.equal(report.review.length, 2);
  assert.ok(report.review.every((item) => item.reasons.includes("conflicting_document")));
  assert.deepEqual(report.currency_totals, []);
});

test("same receipt ID targeting different invoices taints both", () => {
  const report = reconcile(input([event(), event({ email_id: "invoice-2", document_id: "INV-2", invoice_id: "INV-2" }), receipt(), receipt({ email_id: "conflict-email", invoice_id: "INV-2" })]));
  assert.ok(report.rows.every((row) => row.status === "review_required"));
  assert.equal(report.review.length, 2);
});

test("invoice document conflicts never silently pick a total", () => {
  const report = reconcile(input([event(), event({ email_id: "revised-email", amount: "99" }), receipt()]));
  assert.deepEqual(report.rows, []);
  assert.equal(report.review.filter((entry) => entry.reasons.includes("conflicting_document")).length, 2);
  assert.ok(report.review.some((entry) => entry.reasons.includes("invoice_not_found_in_scope")));
});

test("currencies remain separate and credit does not cancel another invoice's outstanding amount", () => {
  const report = reconcile(input([
    event({ amount: "10" }),
    event({ email_id: "invoice-eur", document_id: "INV-EUR", invoice_id: "INV-EUR", currency: "EUR", amount: "20" }),
    event({ email_id: "invoice-credit", document_id: "INV-2", invoice_id: "INV-2", amount: "5" }),
    receipt({ invoice_id: "INV-2", amount: "8" }),
  ]));
  assert.deepEqual(report.currency_totals, [
    { currency: "EUR", reported_outstanding: "20", reported_credit: "0" },
    { currency: "USD", reported_outstanding: "10", reported_credit: "3" },
  ]);
});

test("same invoice identifier from different merchants never merges", () => {
  const report = reconcile(input([event(), receipt({ merchant_id: "another.example" })]));
  assert.equal(report.rows[0].reported_paid, "0");
  assert.equal(report.review[0].reasons[0], "invoice_not_found_in_scope");
});

test("refund reverses reported payment and an explicit credit reverses obligation", () => {
  const report = reconcile(input([event(), receipt({ amount: "100" }), event({ email_id: "refund", event_type: "refund", document_id: "REF-1", amount: "15" }), event({ email_id: "credit", event_type: "credit_note", document_id: "CR-1", amount: "15" })]));
  assert.equal(report.rows[0].reported_balance, "0");
  assert.equal(report.rows[0].reported_refunded, "15");
});

test("exact arithmetic preserves six decimal places and values above Number safe integer", () => {
  const report = reconcile(input([event({ amount: "999999999999999999.123456" }), receipt({ amount: "999999999999999999.123455" })]));
  assert.equal(report.rows[0].reported_balance, "0.000001");
});

test("valid aggregate amounts can exceed the per-document input limit", () => {
  const report = reconcile(input([event({ amount: "999999999999999999" }), event({ email_id: "refund", event_type: "refund", document_id: "REF-1", amount: "999999999999999999" })]));
  assert.equal(report.rows[0].reported_balance, "1999999999999999998");
  assert.equal(report.currency_totals[0].reported_outstanding, "1999999999999999998");
});

test("different currency copies of one issuer document are conflicts", () => {
  const report = reconcile(input([event(), event({ email_id: "eur-copy", currency: "EUR" })]));
  assert.deepEqual(report.rows, []);
  assert.deepEqual(report.currency_totals, []);
  assert.equal(report.review.length, 2);
  assert.ok(report.review.every((entry) => entry.reasons.includes("conflicting_document")));
});

test("unknown sender, non-clean scan, and pending transaction stay out of arithmetic", () => {
  for (const override of [{ sender_authentication: "unknown" }, { sender_authentication: "fail" }, { scan_status: "flagged" }, { scan_status: "skipped" }, { status: "pending" }, { status: "cancelled" }]) {
    const report = reconcile(input([event(), receipt(override)]));
    assert.equal(report.rows[0].reported_paid, "0");
    assert.equal(report.rows[0].status, "review_required");
    assert.equal(report.review.length, 1);
  }
});

test("missing references or ambiguous amounts remain explicit review items", () => {
  for (const override of [{ invoice_id: "" }, { document_id: "" }, { invoice_id: "   " }, { document_id: "   " }, { amount: null }, { currency: null }]) {
    const report = reconcile(input([event(), receipt(override)]));
    assert.equal(report.rows[0].reported_paid, "0");
    assert.equal(report.review.length, 1);
  }
});

test("taint is order independent when another currency lacks its invoice", () => {
  for (const events of [[event(), receipt({ currency: "EUR" })], [receipt({ currency: "EUR" }), event()]]) {
    const report = reconcile(input(events));
    assert.equal(report.rows[0].status, "review_required");
    assert.deepEqual(report.currency_totals, []);
  }
});

test("malformed amounts fail closed instead of coercing or rounding", () => {
  for (const amount of [100, -1, "-1", "1e3", "1,000", "$20", "1.0000001", "NaN", "Infinity", "01", "1000000000000000000"]) {
    assert.throws(() => reconcile(input([event({ amount })])), /amount/);
  }
});

test("input bounds, reference mismatch, and time-window validation", () => {
  assert.throws(() => reconcile(input(Array.from({ length: 501 }, () => event()))), /500/);
  assert.throws(() => reconcile(input([], { date_start: "2026-10-01T00:00:00Z" })), /date_start/);
  assert.throws(() => reconcile(input([], { date_start: "2026-09-01" })), /RFC3339/);
  assert.throws(() => reconcile(input([], { date_start: "2026-02-30T00:00:00Z" })), /invalid calendar/);
  assert.throws(() => reconcile(input([], { date_start: "2026-02-29T00:00:00Z" })), /invalid calendar/);
  assert.doesNotThrow(() => reconcile(input([], { date_start: "2024-02-29T00:00:00Z" })));
  assert.throws(() => reconcile(input([event({ evidence: "x".repeat(501) })])), /500/);
  assert.throws(() => reconcile(input([event({ merchant_id: "x\ny" })])), /control/);
  const report = reconcile(input([event({ document_id: "NOT-INV-1" })]));
  assert.equal(report.review[0].reasons[0], "invoice_reference_mismatch");
});

test("Markdown escapes email-sourced links, HTML, table separators, and emphasis", () => {
  const report = reconcile(input([event({ merchant_id: "<script>|[click](https://bad.example)*", evidence: "`run this` [x](https://bad.example) <img src=x>" })]));
  const markdown = renderMarkdown(report);
  assert.ok(!markdown.includes("<script>"));
  assert.ok(!markdown.includes("[click]("));
  assert.ok(!markdown.includes("<img"));
  assert.ok(markdown.includes("&#124;"));
  assert.ok(markdown.includes("&#96;"));
});

test("empty evidence is not a claim that every invoice is paid", () => {
  const report = reconcile(input([]));
  assert.deepEqual(report.rows, []);
  assert.ok(renderMarkdown(report).includes("No matched invoice groups in the inspected evidence"));
  assert.ok(report.notice.includes("limited"));
});

test("review Markdown exposes source claims and authentication without including them in totals", () => {
  const report = reconcile(input([event({ email_id: "review|email", sender_authentication: "unknown", amount: null, currency: null })]));
  const markdown = renderMarkdown(report);
  assert.ok(markdown.includes("| Source email | Kind | Document | Invoice | Amount | Currency | Scan | Sender authentication | Reason |"));
  assert.ok(markdown.includes("| review&#124;email | invoice | INV-1 | INV-1 | ambiguous | ambiguous | clean | unknown |"));
  assert.ok(markdown.includes("sender&#95;not&#95;authenticated"));
  assert.ok(markdown.includes("Review amounts are source claims, excluded from currency totals."));
  assert.deepEqual(report.currency_totals, []);
});

test("CLI handles real fixture input and malformed invocation", () => {
  const script = new URL("../skills/mermail-reconcile-receipts/scripts/reconcile.mjs", import.meta.url);
  const fixture = new URL("../skills/mermail-reconcile-receipts/assets/demo-ledger.json", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, fixture.pathname], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.rows[0].reported_balance, "0");
  assert.equal(report.duplicate_copies_ignored, 1);
  const bad = spawnSync(process.execPath, [script.pathname], { encoding: "utf8" });
  assert.ifError(bad.error);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Usage:/);
  assert.equal(bad.stdout, "");
});
