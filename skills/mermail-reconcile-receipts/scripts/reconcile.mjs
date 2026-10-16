#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SCALE = 1_000_000n;
const TYPES = new Set(["invoice", "payment_receipt", "credit_note", "refund"]);
const key = (...parts) => JSON.stringify(parts);
const fail = (message) => { throw new Error(message); };

function boundedString(value, field, max = 200, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    fail(`${field} must be a ${allowEmpty ? "possibly empty " : "nonempty "}string of at most ${max} characters`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) fail(`${field} contains control characters`);
  return value;
}

function money(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/u.test(value)) {
    fail("amount must be a nonnegative decimal string (18 integer / 6 fractional digits maximum)");
  }
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * SCALE + BigInt(fraction.padEnd(6, "0"));
}

function decimal(value) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % SCALE).toString().padStart(6, "0").replace(/0+$/u, "");
  return `${sign}${absolute / SCALE}${fraction ? `.${fraction}` : ""}`;
}

function timestamp(value, field) {
  boundedString(value, field, 40);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) {
    fail(`${field} must be an RFC3339 timestamp including timezone`);
  }
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 || Number(parts[9] ?? 0) > 23 || Number(parts[10] ?? 0) > 59) {
    fail(`${field} has an invalid calendar date or time`);
  }
  return Date.parse(value);
}

function validateEvent(event, index) {
  if (!event || typeof event !== "object" || Array.isArray(event)) fail(`events[${index}] must be an object`);
  const fields = ["email_id", "document_id", "merchant_id", "invoice_id", "event_type", "scan_status", "sender_authentication", "status", "evidence"];
  const clean = {};
  for (const field of fields) {
    clean[field] = boundedString(event[field], `events[${index}].${field}`, field === "evidence" ? 500 : 200, ["document_id", "invoice_id"].includes(field));
  }
  if (!TYPES.has(clean.event_type)) fail(`events[${index}].event_type is unsupported`);
  if (!["confirmed", "pending", "cancelled"].includes(clean.status)) fail(`events[${index}].status is unsupported`);
  if (!["pass", "fail", "unknown"].includes(clean.sender_authentication)) fail(`events[${index}].sender_authentication is unsupported`);
  clean.currency = event.currency;
  if (clean.currency !== null && (typeof clean.currency !== "string" || !/^[A-Z][A-Z0-9]{2,9}$/u.test(clean.currency))) {
    fail(`events[${index}].currency must be an uppercase code or null`);
  }
  clean.amount = event.amount === null ? null : decimal(money(event.amount));
  return clean;
}

function missingReasons(event) {
  const reasons = [];
  if (event.scan_status !== "clean") reasons.push("content_not_clean");
  if (event.sender_authentication !== "pass") reasons.push("sender_not_authenticated");
  if (event.status !== "confirmed") reasons.push(`event_${event.status}`);
  if (!event.invoice_id.trim()) reasons.push("missing_invoice_reference");
  if (!event.document_id.trim()) reasons.push("missing_document_reference");
  if (event.amount === null) reasons.push("ambiguous_amount");
  if (event.currency === null) reasons.push("ambiguous_currency");
  if (event.event_type === "invoice" && event.document_id !== event.invoice_id) reasons.push("invoice_reference_mismatch");
  return reasons;
}

export function reconcile(input) {
  if (input?.schema_version !== 1) fail("schema_version must be 1");
  const scope = {};
  for (const field of ["mailbox_id", "date_start", "date_end", "coverage"]) {
    scope[field] = boundedString(input.scope?.[field], `scope.${field}`, field === "coverage" ? 2000 : 200);
  }
  if (timestamp(scope.date_start, "date_start") > timestamp(scope.date_end, "date_end")) fail("date_start must not follow date_end");
  if (!Array.isArray(input.events) || input.events.length > 500) fail("events must be an array of at most 500 records");
  const events = input.events.map(validateEvent);
  const documents = new Map();
  const review = [];
  const tainted = new Set();
  const markReview = (event, reasons) => {
    review.push({ ...event, reasons });
    if (event.invoice_id) tainted.add(key(event.merchant_id, event.invoice_id));
  };
  for (const event of events) {
    const reasons = missingReasons(event);
    if (reasons.length) {
      markReview(event, reasons);
      continue;
    }
    const identity = key(event.merchant_id, event.event_type, event.document_id);
    const versions = documents.get(identity) ?? [];
    versions.push(event);
    documents.set(identity, versions);
  }

  const deduplicated = [];
  let duplicates = 0;
  for (const versions of documents.values()) {
    const first = versions[0];
    if (versions.some((event) => event.amount !== first.amount || event.invoice_id !== first.invoice_id || event.currency !== first.currency)) {
      for (const event of versions) markReview(event, ["conflicting_document"]);
      continue;
    }
    duplicates += versions.length - 1;
    deduplicated.push({
      ...first,
      sources: [...new Map(versions.map((event) => [key(event.email_id, event.evidence), { email_id: event.email_id, evidence: event.evidence }])).values()],
    });
  }

  const grouped = new Map();
  for (const event of deduplicated) {
    const identity = key(event.merchant_id, event.invoice_id, event.currency);
    const group = grouped.get(identity) ?? [];
    group.push(event);
    grouped.set(identity, group);
  }
  const rows = [];
  const rowBalances = new Map();
  for (const group of grouped.values()) {
    const first = group[0];
    if (!group.some((event) => event.event_type === "invoice")) {
      for (const event of group) {
        for (const source of event.sources) markReview({ ...event, ...source, sources: undefined }, ["invoice_not_found_in_scope"]);
      }
      continue;
    }
    const totals = Object.fromEntries([...TYPES].map((type) => [type, 0n]));
    for (const event of group) totals[event.event_type] += money(event.amount);
    const balance = totals.invoice - totals.credit_note - totals.payment_receipt + totals.refund;
    const row = {
      merchant_id: first.merchant_id,
      invoice_id: first.invoice_id,
      currency: first.currency,
      invoiced: decimal(totals.invoice),
      credited: decimal(totals.credit_note),
      reported_paid: decimal(totals.payment_receipt),
      reported_refunded: decimal(totals.refund),
      reported_balance: decimal(balance),
      status: tainted.has(key(first.merchant_id, first.invoice_id)) ? "review_required" : balance > 0n ? "reported_outstanding" : balance < 0n ? "reported_credit" : "balanced_within_evidence",
      documents: group.map(({ document_id, event_type, amount, sources }) => ({ document_id, event_type, amount, sources })),
    };
    rows.push(row);
    rowBalances.set(row, balance);
  }
  for (const row of rows) {
    if (tainted.has(key(row.merchant_id, row.invoice_id))) row.status = "review_required";
  }
  rows.sort((a, b) => key(a.merchant_id, a.invoice_id, a.currency).localeCompare(key(b.merchant_id, b.invoice_id, b.currency), "en"));
  const currencyTotals = new Map();
  for (const row of rows) {
    if (row.status === "review_required") continue;
    const totals = currencyTotals.get(row.currency) ?? { outstanding: 0n, credit: 0n };
    const balance = rowBalances.get(row);
    if (balance > 0n) totals.outstanding += balance;
    if (balance < 0n) totals.credit -= balance;
    currencyTotals.set(row.currency, totals);
  }
  return {
    schema_version: 1,
    scope,
    notice: "Email evidence only; no independent settlement verification. Coverage is limited to the inspected records.",
    input_records: events.length,
    duplicate_copies_ignored: duplicates,
    rows,
    review,
    currency_totals: [...currencyTotals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, totals]) => ({ currency, reported_outstanding: decimal(totals.outstanding), reported_credit: decimal(totals.credit) })),
  };
}

function cell(value) {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/[|`\[\]()\\*_]/gu, (character) => `&#${character.codePointAt(0)};`).replace(/[\r\n]/gu, " ");
}

export function renderMarkdown(report) {
  const lines = ["# Mermail receipt reconciliation", "", report.notice, "", `Mailbox: ${cell(report.scope.mailbox_id)}`, `Window: ${cell(report.scope.date_start)} to ${cell(report.scope.date_end)}`, `Coverage: ${cell(report.scope.coverage)}`, `Input records: ${report.input_records}. Duplicate copies ignored: ${report.duplicate_copies_ignored}.`, "", "| Merchant | Invoice | Currency | Invoiced | Credits | Reported paid | Refunds | Balance | Status |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |"];
  for (const row of report.rows) lines.push(`| ${[row.merchant_id, row.invoice_id, row.currency, row.invoiced, row.credited, row.reported_paid, row.reported_refunded, row.reported_balance, row.status].map(cell).join(" | ")} |`);
  if (!report.rows.length) lines.push("", "No matched invoice groups in the inspected evidence.");
  lines.push("", "## Currency totals", "", "Rows requiring review are excluded. Outstanding and credit amounts are not netted across invoices or currencies.", "");
  for (const total of report.currency_totals) lines.push(`- ${cell(total.currency)}: reported outstanding ${total.reported_outstanding}; reported credit ${total.reported_credit}.`);
  if (!report.currency_totals.length) lines.push("No unambiguous currency totals.");
  lines.push("", "## Evidence", "");
  for (const row of report.rows) {
    lines.push(`### ${cell(row.merchant_id)} / ${cell(row.invoice_id)} / ${cell(row.currency)}`, "");
    for (const document of row.documents) {
      for (const source of document.sources) lines.push(`- ${cell(document.event_type)} ${cell(document.document_id)} (${cell(document.amount)}): email ${cell(source.email_id)} — ${cell(source.evidence)}`);
    }
    lines.push("");
  }
  lines.push("## Review queue", "");
  if (report.review.length) {
    lines.push("Review amounts are source claims, excluded from currency totals.", "", "| Source email | Kind | Document | Invoice | Amount | Currency | Scan | Sender authentication | Reason |", "| --- | --- | --- | --- | ---: | --- | --- | --- | --- |");
    for (const event of report.review) lines.push(`| ${[event.email_id, event.event_type, event.document_id || "missing", event.invoice_id || "missing", event.amount ?? "ambiguous", event.currency ?? "ambiguous", event.scan_status, event.sender_authentication, event.reasons.join(", ")].map(cell).join(" | ")} |`);
    lines.push("");
    for (const event of report.review) lines.push(`- Email ${cell(event.email_id)}: ${cell(event.evidence)}`);
  }
  if (!report.review.length) lines.push("No exceptions found in the supplied evidence; this does not establish completeness.");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== "--markdown")) fail("Usage: node reconcile.mjs INPUT.json [--markdown]");
    if ((await stat(args[0])).size > 2 * 1024 * 1024) fail("Input file exceeds 2 MiB");
    const content = await readFile(args[0], "utf8");
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) fail("Input file exceeds 2 MiB");
    const report = reconcile(JSON.parse(content));
    process.stdout.write(args[1] ? renderMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Reconciliation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
