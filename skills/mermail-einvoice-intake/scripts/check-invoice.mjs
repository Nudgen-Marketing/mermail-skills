#!/usr/bin/env node
// Bounded, namespace-aware UBL Invoice pre-check; no dependencies or external I/O.
// CLI: node check-invoice.mjs < invoice.xml. Exit 0 pass, 1 fail, 2 unsupported/refused.
// Not an XML Schema, official schematron, code-list or national CIUS validator.
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 1024 * 1024;
const MAX_ATTRIBUTES = 64;
const MAX_NAMESPACES = 64;
const INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const XML = "http://www.w3.org/XML/1998/namespace";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const SCOPE = "Pre-check of the EN 16931 rules listed in checkedRules on UBL 2.1 Invoice only. " +
  "Local XML/amount prerequisites are not additional EN rules. " +
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
const SUPPORTED = [...RULES.map(r => r[0]), "BR-16", "BR-CO-15"];
const aggregates = new Set(["AccountingSupplierParty", "AccountingCustomerParty", "Party",
  "PartyLegalEntity", "LegalMonetaryTotal", "InvoiceLine", "TaxTotal"]);
const start = "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const name = new RegExp("^[" + start + "][" + start + "\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$", "u");
const space = /^[ \t\r\n]*$/;
const validChar = n => n === 9 || n === 10 || n === 13 ||
  (n >= 0x20 && n <= 0xD7FF) || (n >= 0xE000 && n <= 0xFFFD) ||
  (n >= 0x10000 && n <= 0x10FFFF);
function fail(reason) { throw new Error(reason); }
function qualified(qname) {
  const parts = qname.split(":");
  if (parts.length > 2 || parts.some(part => !name.test(part))) fail("invalid XML name");
  return parts.length === 1 ? ["", parts[0]] : parts;
}
function decode(text) {
  let out = "", from = 0;
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  for (;;) {
    const at = text.indexOf("&", from);
    if (at < 0) return out + text.slice(from);
    out += text.slice(from, at);
    const end = text.indexOf(";", at + 1);
    if (end < 0) fail("unterminated XML entity");
    const entity = text.slice(at + 1, end);
    if (Object.hasOwn(entities, entity)) out += entities[entity];
    else if (/^#(?:[0-9]+|x[0-9A-Fa-f]+)$/.test(entity)) {
      const n = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      if (!validChar(n)) fail("invalid XML character reference");
      out += String.fromCodePoint(n);
    } else fail("unknown XML entity");
    from = end + 1;
  }
}
function parse(xml) {
  for (const char of xml) if (!validChar(char.codePointAt(0))) fail("invalid XML character");
  const doc = { children: [], text: "", namespaces: new Map([["xml", XML]]) };
  const stack = [doc];
  let i = 0, nodes = 0;
  while (i < xml.length) {
    const top = stack.at(-1);
    if (xml[i] !== "<") {
      const end = xml.indexOf("<", i), next = end < 0 ? xml.length : end;
      const text = xml.slice(i, next);
      if (text.includes("]]>")) fail("CDATA terminator outside CDATA");
      if (stack.length === 1 && !space.test(text)) fail("text outside document element");
      top.text += decode(text); i = next; continue;
    }
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      if (end < 0 || xml.slice(i + 4, end).includes("--") || xml[end - 1] === "-") fail("malformed XML comment");
      i = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      if (end < 0 || stack.length === 1) fail("invalid CDATA section");
      top.text += xml.slice(i + 9, end); i = end + 3; continue;
    }
    if (xml.startsWith("<?", i)) {
      const end = xml.indexOf("?>", i + 2);
      if (end < 0) fail("unterminated processing instruction");
      const contents = xml.slice(i + 2, end), target = contents.match(/^([^ \t\r\n?]+)/)?.[1];
      if (!target) fail("invalid processing instruction");
      qualified(target);
      if (contents.length > target.length && !/^[ \t\r\n]/.test(contents.slice(target.length))) fail("invalid processing instruction separator");
      if (target.toLowerCase() === "xml") {
        if (i !== 0 || !/^xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*$/.test(contents)) fail("unsupported or misplaced XML declaration");
      }
      i = end + 2; continue;
    }
    if (xml.startsWith("<!", i)) fail("DTD, entity declaration or unsupported markup present");
    if (xml.startsWith("</", i)) {
      const end = xml.indexOf(">", i + 2);
      if (end < 0) fail("unterminated closing tag");
      const close = xml.slice(i + 2, end);
      const m = /^([^ \t\r\n]+)[ \t\r\n]*$/.exec(close);
      if (!m || stack.length === 1 || top.qname !== m[1]) fail("mismatched closing tag");
      stack.pop(); i = end + 1; continue;
    }
    // Find the tag end without treating '>' in a quoted attribute as markup.
    let end = i + 1, quote = "";
    for (; end < xml.length; end++) {
      const ch = xml[end];
      if (quote) { if (ch === quote) quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      else if (ch === "<") fail("malformed opening tag");
    }
    if (end === xml.length || quote) fail("unterminated opening tag");
    let inside = xml.slice(i + 1, end), selfClosing = inside.endsWith("/");
    if (selfClosing) inside = inside.slice(0, -1);
    const m = /^([^ \t\r\n/]+)([\s\S]*)$/.exec(inside);
    if (!m) fail("invalid opening tag");
    const qname = m[1], [prefix, local] = qualified(qname);
    const attrs = new Map();
    let rest = m[2];
    while (rest.length) {
      if (space.test(rest)) break;
      const a = /^[ \t\r\n]+([^ \t\r\n=]+)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
      if (!a) fail("malformed XML attribute");
      qualified(a[1]);
      if (attrs.has(a[1])) fail("duplicate XML attribute");
      if (attrs.size >= MAX_ATTRIBUTES) fail("XML element exceeds 64 attributes");
      attrs.set(a[1], decode(a[2] ?? a[3]));
      rest = rest.slice(a[0].length);
    }
    // Treat inherited maps as immutable: ordinary children share them. Clone only
    // when a local declaration changes the environment, and bound retained maps.
    const declarations = [...attrs].filter(([key]) => key === "xmlns" || key.startsWith("xmlns:"));
    const namespaces = declarations.length ? new Map(top.namespaces) : top.namespaces;
    for (const [key, uri] of declarations) {
      const bound = key === "xmlns" ? "" : key.slice(6);
      if (bound === "xmlns" || uri === XMLNS || (bound === "xml" ? uri !== XML : uri === XML) || (bound && !uri)) fail("invalid namespace declaration");
      namespaces.set(bound, uri);
      if (namespaces.size > MAX_NAMESPACES) fail("XML scope exceeds 64 namespace bindings");
    }
    if (prefix === "xmlns" || (prefix && !namespaces.has(prefix))) fail("unbound element namespace");
    const ns = namespaces.get(prefix) ?? "", expanded = new Set(), plainAttrs = Object.create(null);
    for (const [key, value] of attrs) {
      if (key === "xmlns" || key.startsWith("xmlns:")) continue;
      const [ap, an] = qualified(key);
      if (ap && !namespaces.has(ap)) fail("unbound attribute namespace");
      const identity = JSON.stringify([ap ? namespaces.get(ap) : "", an]);
      if (expanded.has(identity)) fail("duplicate expanded XML attribute");
      expanded.add(identity);
      if (!ap) plainAttrs[an] = value;
    }
    const element = { name: local, qname, ns, attrs: plainAttrs, namespaces, children: [], text: "" };
    top.children.push(element);
    if (++nodes > 50000 || stack.length >= 128) fail("XML tree exceeds local bounds");
    if (!selfClosing) stack.push(element);
    i = end + 1;
  }
  if (stack.length !== 1 || doc.children.length !== 1 || !space.test(doc.text)) fail("not a single-root XML document");
  return doc.children[0];
}
const kids = (el, local) => el.children.filter(c => c.name === local && c.ns === (aggregates.has(local) ? CAC : CBC));
function find(el, path) {
  let level = [el];
  for (const local of path) level = level.flatMap(e => kids(e, local));
  return level;
}
const simple = el => el && el.children.length === 0 ? el.text.trim() : null;
function cents(text) {
  if (typeof text !== "string" || text.length > 128) return null;
  const m = /^([+-]?)(?:(\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))$/.exec(text);
  if (!m) return null;
  const n = BigInt(m[2] ?? "0") * 100n + BigInt((m[3] ?? m[4] ?? "0").padEnd(2, "0"));
  return m[1] === "-" ? -n : n;
}
function result(code, details, checkedRules = [], skippedRules = []) {
  return { code, output: { checker: "check-invoice.mjs/2", scope: SCOPE, supportedRules: SUPPORTED, checkedRules, skippedRules, ...details } };
}
const refused = reason => result(2, { syntax: null, verdict: "refused", reason, findings: [] });
export function checkInvoice(input) {
  if (typeof input !== "string") return refused("input is not XML text");
  if (Buffer.byteLength(input, "utf8") > MAX_BYTES) return refused("input exceeds 1 MiB");
  const xml = input.replace(/^\uFEFF/, "");
  if (!xml.trimStart().startsWith("<")) return refused("input is not XML");
  let doc;
  try { doc = parse(xml); } catch (error) { return refused(error.message); }
  if (doc.name === "CrossIndustryInvoice") return result(2, { syntax: "UN-CEFACT-CII", verdict: "unsupported", reason: "CII syntax is not checked by this script", findings: [] });
  if (doc.name !== "Invoice") return result(2, { syntax: null, verdict: "unsupported", reason: "root is not a UBL Invoice", findings: [] });
  if (doc.ns !== INVOICE) return refused("Invoice root without the UBL Invoice namespace");
  const findings = [], checked = RULES.map(r => r[0]);
  for (const [rule, bt, message, path] of RULES) {
    const elements = find(doc, path);
    if (elements.length !== 1 || !simple(elements[0])) findings.push({ rule, bt, message });
  }
  checked.push("BR-16");
  if (kids(doc, "InvoiceLine").length === 0) findings.push({ rule: "BR-16", bt: "BG-25", message: "An Invoice shall have at least one Invoice line." });
  const currencyElements = find(doc, ["DocumentCurrencyCode"]);
  const currency = currencyElements.length === 1 ? simple(currencyElements[0]) : null;
  function amount(elements, bt) {
    if (elements.length !== 1 || !currency || elements[0].attrs.currencyID !== currency) {
      findings.push({ rule: "LOCAL-AMOUNT", bt, message: "Amount prerequisite must occur once with the invoice currencyID; arithmetic was not evaluated." });
      return null;
    }
    const n = cents(simple(elements[0]));
    if (n === null) findings.push({ rule: "LOCAL-AMOUNT", bt, message: "Amount prerequisite must be a decimal with at most two fractional digits and 128 characters; arithmetic was not evaluated." });
    return n;
  }
  const totals = kids(doc, "LegalMonetaryTotal");
  const without = amount(totals.length === 1 ? kids(totals[0], "TaxExclusiveAmount") : [], "BT-109");
  const withVat = amount(totals.length === 1 ? kids(totals[0], "TaxInclusiveAmount") : [], "BT-112");
  const vat = amount(find(doc, ["TaxTotal", "TaxAmount"]).filter(e => e.attrs.currencyID === currency), "BT-110");
  const skipped = [];
  if (without === null || withVat === null || vat === null) skipped.push("BR-CO-15");
  else {
    checked.push("BR-CO-15");
    if (withVat !== without + vat) findings.push({ rule: "BR-CO-15", bt: "BT-112", message: "Invoice total amount with VAT (BT-112) shall equal Invoice total amount without VAT (BT-109) plus Invoice total VAT amount (BT-110)." });
  }
  return result(findings.length ? 1 : 0, { syntax: "UBL-2.1-Invoice", verdict: findings.length ? "fail" : "pass", findings }, checked, skipped);
}
async function main() {
  const chunks = [];
  let size = 0, outcome;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES) { outcome = refused("input exceeds 1 MiB"); break; }
    chunks.push(chunk);
  }
  if (!outcome) {
    try { outcome = checkInvoice(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { outcome = refused("input is not UTF-8"); }
  }
  process.stdout.write(JSON.stringify(outcome.output) + "\n");
  process.exitCode = outcome.code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
