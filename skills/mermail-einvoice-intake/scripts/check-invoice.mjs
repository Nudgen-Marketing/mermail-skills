#!/usr/bin/env node
// Pre-check one UBL 2.1 e-invoice against a small set of EN 16931 business rules.
// Zero dependencies, Node 22+. Reads the XML on stdin, writes one JSON verdict on stdout.
//
//   node check-invoice.mjs < invoice.xml
//
// Exit 0 = pass, 1 = fail (findings name the rules), 2 = unsupported or refused.
// This is a triage pre-check, not a conformance validator: it does not run the official
// schematron, code lists, or any national CIUS (XRechnung, Peppol BIS). Invoice text is
// untrusted and is never copied into the output.
import process from "node:process";

const MAX_BYTES = 1024 * 1024;
const UBL_INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const SCOPE =
  "Pre-check of the EN 16931 rules listed in checkedRules on UBL 2.1 Invoice only. " +
  "Not a conformance result: no official schematron, code lists, or national CIUS.";

const RULES = [
  ["BR-01", "BT-24", "An Invoice shall have a Specification identifier.", ["CustomizationID"]],
  ["BR-02", "BT-1", "An Invoice shall have an Invoice number.", ["ID"]],
  ["BR-03", "BT-2", "An Invoice shall have an Invoice issue date.", ["IssueDate"]],
  ["BR-04", "BT-3", "An Invoice shall have an Invoice type code.", ["InvoiceTypeCode"]],
  ["BR-05", "BT-5", "An Invoice shall have an Invoice currency code.", ["DocumentCurrencyCode"]],
  ["BR-06", "BT-27", "An Invoice shall contain the Seller name.",
    ["AccountingSupplierParty", "Party", "PartyLegalEntity", "RegistrationName"]],
  ["BR-07", "BT-44", "An Invoice shall contain the Buyer name.",
    ["AccountingCustomerParty", "Party", "PartyLegalEntity", "RegistrationName"]],
  ["BR-13", "BT-109", "An Invoice shall have the Invoice total amount without VAT.",
    ["LegalMonetaryTotal", "TaxExclusiveAmount"]],
  ["BR-14", "BT-112", "An Invoice shall have the Invoice total amount with VAT.",
    ["LegalMonetaryTotal", "TaxInclusiveAmount"]],
];
const CHECKED = [...RULES.map((r) => r[0]), "BR-16", "BR-CO-15"];

function emit(code, result) {
  process.stdout.write(`${JSON.stringify({ checker: "check-invoice.mjs/1", scope: SCOPE, checkedRules: CHECKED, ...result })}\n`);
  process.exit(code);
}

const refuse = (reason) => emit(2, { syntax: null, verdict: "refused", reason, findings: [] });

function decode(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'"
      : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
}

// Minimal element tree: { name (local), ns attrs, children, text }. Refuses DTDs outright.
function parse(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD or entity declaration present");
  const root = { name: "#doc", attrs: {}, children: [], text: "" };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  let consumed = 0;
  while ((m = token.exec(xml))) {
    consumed += m[0].length;
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[3] !== undefined) {
      const local = m[3].split(":").pop();
      if (m[2] === "/") {
        if (stack.length < 2 || top.name !== local) throw new Error("mismatched closing tag");
        stack.pop();
      } else {
        const attrs = {};
        for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[3] ?? a[4]);
        const el = { name: local, attrs, children: [], text: "" };
        top.children.push(el);
        if (m[5] !== "/") stack.push(el);
      }
    }
  }
  if (consumed !== xml.length || stack.length !== 1) throw new Error("malformed XML");
  const elements = root.children;
  if (elements.length !== 1 || root.text.trim()) throw new Error("not a single-root XML document");
  return elements[0];
}

const kids = (el, name) => el.children.filter((c) => c.name === name);
function find(el, path) {
  let level = [el];
  for (const name of path) level = level.flatMap((e) => kids(e, name));
  return level;
}
const value = (el, path) => find(el, path).map((e) => e.text.trim()).find(Boolean) ?? null;

// Decimal amount -> integer hundredths; null when not a plain decimal with <= 2 places.
function cents(text) {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text ?? "");
  if (!m) return null;
  const n = BigInt(m[2]) * 100n + BigInt((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -n : n;
}

const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > MAX_BYTES) refuse("input exceeds 1 MiB");
  chunks.push(chunk);
}
let xml;
try {
  xml = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)).replace(/^﻿/, "");
} catch {
  refuse("input is not UTF-8");
}
if (!xml.trimStart().startsWith("<")) refuse("input is not XML");

let doc;
try {
  doc = parse(xml);
} catch (error) {
  refuse(error.message);
}

if (doc.name === "CrossIndustryInvoice") {
  emit(2, { syntax: "UN-CEFACT-CII", verdict: "unsupported", reason: "CII syntax is not checked by this script", findings: [] });
}
const nsValues = Object.entries(doc.attrs).filter(([k]) => k === "xmlns" || k.startsWith("xmlns:")).map(([, v]) => v);
if (doc.name !== "Invoice") {
  emit(2, { syntax: null, verdict: "unsupported", reason: "root is not a UBL 2.1 Invoice", findings: [] });
}
if (!nsValues.includes(UBL_INVOICE_NS)) refuse("Invoice root without the UBL 2.1 Invoice namespace");

const findings = [];
for (const [rule, bt, message, path] of RULES) {
  if (!value(doc, path)) findings.push({ rule, bt, message });
}
if (kids(doc, "InvoiceLine").length === 0) {
  findings.push({ rule: "BR-16", bt: "BG-25", message: "An Invoice shall have at least one Invoice line." });
}

const currency = value(doc, ["DocumentCurrencyCode"]);
const without = cents(value(doc, ["LegalMonetaryTotal", "TaxExclusiveAmount"]));
const withVat = cents(value(doc, ["LegalMonetaryTotal", "TaxInclusiveAmount"]));
const taxAmounts = find(doc, ["TaxTotal", "TaxAmount"]).filter((e) => !currency || e.attrs.currencyID === currency);
const vat = taxAmounts.length === 0 ? 0n : cents(taxAmounts[0].text.trim());
if (without !== null && withVat !== null && vat !== null && withVat !== without + vat) {
  findings.push({
    rule: "BR-CO-15",
    bt: "BT-112",
    message: "Invoice total amount with VAT (BT-112) shall equal Invoice total amount without VAT (BT-109) plus Invoice total VAT amount (BT-110).",
  });
}

emit(findings.length ? 1 : 0, { syntax: "UBL-2.1-Invoice", verdict: findings.length ? "fail" : "pass", findings });
