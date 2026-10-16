import { pathToFileURL } from "node:url";

const precision = Object.freeze({ USD: 2, EUR: 2, GBP: 2, MYR: 2, SGD: 2, AUD: 2, CAD: 2, JPY: 0, KRW: 0, BHD: 3, KWD: 3, USDC: 6 });
const text = (value) => typeof value === "string" && value.trim().length > 0;
const normal = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

function units(amount, places) {
  if (typeof amount !== "string" || !/^\d+(?:\.\d+)?$/.test(amount) || amount.length > 80) return null;
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > places) return null;
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0") || "0");
}

function decimal(value, places) {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const scale = 10n ** BigInt(places);
  return sign + (magnitude / scale).toString() + (places ? "." + (magnitude % scale).toString().padStart(places, "0") : "");
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function inspect(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { index, raw: {}, reasons: ["invalid_record"], warnings: [] };
  const currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  const places = precision[currency];
  const amount = places === undefined ? null : units(raw.amount, places);
  const reasons = [];
  if (!text(raw.email_id)) reasons.push("missing_source_email_id");
  if (!text(raw.merchant)) reasons.push("missing_merchant");
  if (raw.scan_status !== "clean" || raw.content_omitted !== false || raw.truncated !== false) reasons.push("unsafe_or_incomplete_body");
  if (!["pass", "unknown"].includes(raw.sender_authentication)) reasons.push("sender_not_authenticated");
  if (places === undefined) reasons.push("unsupported_or_ambiguous_currency");
  else if (amount === null) reasons.push("invalid_amount_or_precision");
  const bucket = raw.kind === "refund" && raw.status === "refunded" ? "refund"
    : ["receipt", "invoice"].includes(raw.kind) && raw.status === "paid" ? "paid"
      : raw.kind === "invoice" && raw.status === "due" ? "outstanding" : null;
  if (!bucket) reasons.push("unresolved_kind_or_status");
  for (const field of ["amount", "currency", "status"]) {
    if (!text(raw.evidence?.[field])) reasons.push(`missing_${field}_evidence`);
  }
  if (text(raw.invoice_id) && !text(raw.evidence?.invoice_id)) reasons.push("missing_invoice_id_evidence");
  const warnings = [];
  if (raw.sender_authentication === "unknown") warnings.push("sender_authentication_unavailable");
  if (!text(raw.invoice_id)) warnings.push("no_invoice_id_no_cross_email_deduplication");
  if (raw.document_date == null || raw.document_date === "") warnings.push("document_date_missing");
  else if (!validDate(raw.document_date)) reasons.push("invalid_document_date");
  return { index, raw, currency, places, amount, bucket, reasons, warnings };
}

/** Pure calculator for extracted evidence. No mail fetches or external effects. */
export function buildLedger(records) {
  if (!Array.isArray(records) || records.length > 1000) throw new TypeError("Input must be an array of at most 1000 extracted document records");
  const checked = records.map(inspect);
  const groups = new Map();
  for (const record of checked) {
    const { raw, index } = record;
    // Group across currency/kind to catch inconsistent versions of one document.
    const key = text(raw.merchant) && text(raw.invoice_id)
      ? JSON.stringify([normal(raw.merchant), raw.invoice_id.trim()])
      : text(raw.email_id) ? JSON.stringify(["source", raw.email_id.trim()]) : JSON.stringify(["invalid", index]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const entries = [], review = [], duplicates = [], sums = new Map(), unverifiedSums = new Map();
  const enqueue = (record, extra = []) => review.push({ record_index: record.index, email_id: record.raw.email_id ?? null, reasons: [...record.reasons, ...extra] });
  for (const group of groups.values()) {
    const signatures = new Set(group.map((r) => JSON.stringify([text(r.raw.merchant) ? normal(r.raw.merchant) : null, r.raw.invoice_id ?? null, r.currency, r.amount?.toString() ?? r.raw.amount ?? null, r.raw.kind, r.raw.status, r.raw.document_date ?? null])));
    if (group.length > 1 && (signatures.size > 1 || group.some((r) => r.reasons.length))) {
      group.forEach((r) => enqueue(r, ["conflicting_or_unverifiable_copies"]));
      continue;
    }
    const record = group[0];
    if (record.reasons.length) { enqueue(record); continue; }
    const { raw, currency, places, amount, bucket } = record;
    const originUnverified = group.some((r) => r.raw.sender_authentication === "unknown");
    const warnings = [...new Set(group.flatMap((r) => r.warnings))];
    group.filter((r) => r.raw.sender_authentication === "unknown").forEach((r) => enqueue(r, ["sender_authentication_unavailable"]));
    const sources = [...new Set(group.map((r) => r.raw.email_id.trim()))];
    if (group.length > 1) duplicates.push({ invoice_id: raw.invoice_id ?? null, source_email_ids: sources, copies: group.length, counted: 1 });
    entries.push({ merchant: raw.merchant.trim(), invoice_id: text(raw.invoice_id) ? raw.invoice_id.trim() : null, document_date: raw.document_date ?? null, currency, amount: decimal(amount, places), kind: raw.kind, status: raw.status, origin_confidence: originUnverified ? "unverified" : "authenticated_sender", source_email_ids: sources, evidence: raw.evidence, warnings });
    const target = originUnverified ? unverifiedSums : sums;
    if (!target.has(currency)) target.set(currency, { paid: 0n, refund: 0n, outstanding: 0n });
    target.get(currency)[bucket] += amount;
  }
  const summarize = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, sum]) => [currency, {
    paid: decimal(sum.paid, precision[currency]), refunds: decimal(sum.refund, precision[currency]),
    net: decimal(sum.paid - sum.refund, precision[currency]), outstanding: decimal(sum.outstanding, precision[currency]),
  }]));
  return { basis: "As stated by email; not bank-verified. Unknown-origin claims remain in separate unverified_totals and require review. Separate currencies; no FX conversion.", input_records: records.length, counted_documents: entries.length, entries, totals: summarize(sums), unverified_totals: summarize(unverifiedSums), duplicates, review };
}

function csvCell(value) {
  let content = value == null ? "" : String(value);
  // Whitespace before a formula marker can be ignored by spreadsheet importers.
  if (/^[\s\uFEFF]*[=+\-@]/.test(content) || /^[\t\r\n]/.test(content)) content = "'" + content;
  return '"' + content.replaceAll('"', '""') + '"';
}

export function ledgerCsv(ledger) {
  const header = ["merchant", "invoice_id", "document_date", "currency", "amount", "kind", "status", "origin_confidence", "source_email_ids", "warnings"];
  return [header.map(csvCell).join(","), ...ledger.entries.map((row) => header.map((key) => csvCell(Array.isArray(row[key]) ? row[key].join(" | ") : row[key])).join(","))].join("\r\n") + "\r\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--csv") || args.length > 1) throw new Error("Usage: receipt-ledger.mjs [--csv] < extracted-records.json");
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error("Input exceeds the 2 MB local extraction limit");
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf8");
    const ledger = buildLedger(JSON.parse(input));
    process.stdout.write(args.includes("--csv") ? ledgerCsv(ledger) : JSON.stringify(ledger, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(`Receipt ledger: ${error.message}\n`);
    process.exitCode = 1;
  }
}
