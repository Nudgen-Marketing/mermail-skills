import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkInvoice } from "../skills/mermail-einvoice-intake/scripts/check-invoice.mjs";

const base = "urn:oasis:names:specification:ubl:schema:xsd:";
const invoice = (without = "100.00", tax = "20.00", total = "120.00") => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="${base}Invoice-2" xmlns:b="${base}CommonBasicComponents-2" xmlns:a="${base}CommonAggregateComponents-2">
<b:CustomizationID>urn:example:synthetic</b:CustomizationID><b:ID>EXAMPLE-1</b:ID>
<b:IssueDate>2026-10-21</b:IssueDate><b:InvoiceTypeCode>380</b:InvoiceTypeCode><b:DocumentCurrencyCode>EUR</b:DocumentCurrencyCode>
<a:AccountingSupplierParty><a:Party><a:PartyLegalEntity><b:RegistrationName>Example supplier</b:RegistrationName></a:PartyLegalEntity></a:Party></a:AccountingSupplierParty>
<a:AccountingCustomerParty><a:Party><a:PartyLegalEntity><b:RegistrationName>Example buyer</b:RegistrationName></a:PartyLegalEntity></a:Party></a:AccountingCustomerParty>
<a:TaxTotal><b:TaxAmount currencyID="EUR">${tax}</b:TaxAmount></a:TaxTotal>
<a:LegalMonetaryTotal><b:TaxExclusiveAmount currencyID="EUR">${without}</b:TaxExclusiveAmount><b:TaxInclusiveAmount currencyID="EUR">${total}</b:TaxInclusiveAmount></a:LegalMonetaryTotal>
<a:InvoiceLine><b:ID>1</b:ID></a:InvoiceLine></Invoice>`;
const run = xml => checkInvoice(xml);
const script = fileURLToPath(new URL("../skills/mermail-einvoice-intake/scripts/check-invoice.mjs", import.meta.url));
const cli = input => spawnSync(process.execPath, [script], { input, cwd: tmpdir(), encoding: "utf8", timeout: 5000 });

test("realistic invoice and alternate prefixes/default namespaces preserve the pre-check", () => {
  const original = invoice();
  const prefixed = original.replace('<Invoice xmlns=', '<ubl:Invoice xmlns:ubl=').replace('</Invoice>', '</ubl:Invoice>');
  const renamed = original.replace(/(<\/?)b:/g, '$1basic:').replace('xmlns:b=', 'xmlns:basic=').replace(/(<\/?)a:/g, '$1agg:').replace('xmlns:a=', 'xmlns:agg=');
  const scoped = original.replace('<b:ID>EXAMPLE-1</b:ID>', `<ID xmlns="${base}CommonBasicComponents-2">EXAMPLE-1</ID>`);
  for (const xml of [original, prefixed, renamed, scoped]) {
    const result = run(xml);
    assert.equal(result.code, 0, JSON.stringify(result.output));
    assert.equal(result.output.verdict, "pass");
    assert.equal(result.output.checkedRules.length, 11);
    assert.deepEqual(result.output.skippedRules, []);
  }
});

test("unused legitimate namespace declaration cannot validate a wrong root namespace", () => {
  const wrong = invoice().replace('<Invoice xmlns=', '<evil:Invoice xmlns:evil="urn:evil" xmlns=').replace('</Invoice>', '</evil:Invoice>');
  const result = run(wrong);
  assert.equal(result.code, 2);
  assert.equal(result.output.verdict, "refused");
  assert.deepEqual(result.output.checkedRules, []);
});

test("basic and aggregate fields bind namespace URI, not local name or prefix spelling", () => {
  for (const xml of [
    invoice().replace(`xmlns:b="${base}CommonBasicComponents-2"`, 'xmlns:b="urn:evil"'),
    invoice().replace(`xmlns:a="${base}CommonAggregateComponents-2"`, 'xmlns:a="urn:evil"'),
    invoice().replace('<b:ID>EXAMPLE-1</b:ID>', '<b:ID xmlns:b="urn:evil">EXAMPLE-1</b:ID>'),
    invoice().replace('<a:InvoiceLine>', '<a:InvoiceLine xmlns:a="urn:evil">'),
  ]) assert.equal(run(xml).output.verdict, "fail");
  assert.equal(run(invoice().replace('<b:ID>EXAMPLE-1</b:ID>', '<x:ID>EXAMPLE-1</x:ID>')).output.verdict, "refused");
});

test("invalid monetary prerequisites fail and never claim skipped arithmetic was checked", () => {
  for (const invalid of ["nonsense", "NaN", "Infinity", "1e2", "100.001", "", "--1", "1,000", "1.0.0", "9".repeat(129), '<b:ID>100</b:ID>']) {
    for (const xml of [invoice(invalid), invoice("100.00", invalid), invoice("100.00", "20.00", invalid)]) {
      const result = run(xml);
      assert.equal(result.code, 1);
      assert.equal(result.output.verdict, "fail");
      assert.ok(result.output.findings.some(x => x.rule === "LOCAL-AMOUNT"));
      assert.ok(!result.output.checkedRules.includes("BR-CO-15"));
      assert.deepEqual(result.output.skippedRules, ["BR-CO-15"]);
    }
  }
});

test("exact large, signed, zero and XML decimal lexical values have no floating-point loss", () => {
  for (const [without, tax, total] of [
    ['9007199254740993.01', '0.02', '9007199254740993.03'],
    ['0', '0.00', '0.00'], ['-100.00', '-20.00', '-120.00'],
    ['+.50', '+.10', '+.60'], ['100.', '20.', '120.'],
  ]) assert.equal(run(invoice(without, tax, total)).output.verdict, "pass");
  const mismatch = run(invoice('9007199254740993.01', '0.02', '9007199254740993.02'));
  assert.equal(mismatch.output.verdict, "fail");
  assert.ok(mismatch.output.checkedRules.includes("BR-CO-15"));
  assert.ok(mismatch.output.findings.some(x => x.rule === "BR-CO-15"));
});

test("missing, duplicate and mismatched-currency totals cannot be assumed or combined", () => {
  const xml = invoice();
  const tax = '<a:TaxTotal><b:TaxAmount currencyID="EUR">20.00</b:TaxAmount></a:TaxTotal>';
  const without = '<b:TaxExclusiveAmount currencyID="EUR">100.00</b:TaxExclusiveAmount>';
  for (const changed of [
    xml.replace(tax, ''), xml.replace(tax, tax + tax),
    xml.replace(without, without + without),
    xml.replace('currencyID="EUR">100.00', 'currencyID="USD">100.00'),
    xml.replace('currencyID="EUR">100.00', '>100.00'),
    xml.replace(without, without + '</a:LegalMonetaryTotal><a:LegalMonetaryTotal>'),
  ]) {
    const result = run(changed);
    assert.equal(result.output.verdict, "fail");
    assert.deepEqual(result.output.skippedRules, ["BR-CO-15"]);
  }
  // A second tax-accounting currency is distinct from the invoice-currency VAT.
  assert.equal(run(xml.replace(tax, tax + tax.replaceAll('EUR', 'USD'))).output.verdict, "pass");
});

test("well-formed comments, CDATA, entities and quoted greater-than are supported", () => {
  const xml = invoice().replace('<b:ID>EXAMPLE-1</b:ID>', '<!-- inert --><b:ID label="a > b"><![CDATA[EXAMPLE<&]]>&amp;&#49;&#x32;</b:ID>');
  assert.equal(run(xml).output.verdict, "pass");
  assert.equal(run(invoice().replace('100.00', '&#49;00.00')).output.verdict, "pass");
});

test("malformed XML, namespace aliases, declarations and entities fail closed", () => {
  const xml = invoice();
  for (const changed of [
    xml.replace('</b:ID>', '</a:ID>'),
    xml.replace('<b:ID>EXAMPLE-1', '<b:ID garbage>EXAMPLE-1'),
    xml.replace('<b:ID>EXAMPLE-1', '<b:ID x="1" x="2">EXAMPLE-1'),
    xml.replace('<b:ID>EXAMPLE-1', '<b:ID xmlns:x="urn:x" xmlns:y="urn:x" x:z="1" y:z="2">EXAMPLE-1'),
    xml.replace('<b:ID>EXAMPLE-1', '<b:ID xmlns:xml="urn:evil">EXAMPLE-1'),
    xml.replace('<b:ID>EXAMPLE-1', '<b:ID xmlns:bad="">EXAMPLE-1'),
    xml.replace('EXAMPLE-1', '&unknown;'), xml.replace('EXAMPLE-1', '&amp'),
    xml.replace('EXAMPLE-1', '&#0;'), xml.replace('EXAMPLE-1', '&#xD800;'),
    xml.replace('EXAMPLE-1', '<!--bad--comment-->'), xml.replace('EXAMPLE-1', '<!--bad--->'),
    xml.replace('EXAMPLE-1', ']]>'), xml.replace('EXAMPLE-1', '\u0000'),
    xml + '<Invoice/>', xml + 'garbage',
    '<!DOCTYPE Invoice [<!ENTITY ext SYSTEM "file:///no-such-file">]>' + xml,
    xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'),
  ]) assert.equal(run(changed).output.verdict, "refused", changed.slice(0, 100));
});

test("bounded input and unsupported syntaxes report no performed EN checks", () => {
  for (const xml of ['not XML', '<Invoice>'.repeat(130), '<Invoice>' + 'x'.repeat(1024 * 1024) + '</Invoice>']) {
    const result = run(xml);
    assert.equal(result.output.verdict, "refused");
    assert.deepEqual(result.output.checkedRules, []);
  }
  for (const xml of ['<CrossIndustryInvoice/>', '<Other/>']) {
    assert.equal(run(xml).output.verdict, "unsupported");
    assert.deepEqual(run(xml).output.checkedRules, []);
  }
});

test("actual CLI mirrors verdict/exit behavior and refuses invalid UTF-8", () => {
  for (const [input, code, verdict] of [
    [invoice(), 0, 'pass'], [invoice('nonsense'), 1, 'fail'],
    [invoice().replace(`xmlns="${base}Invoice-2"`, 'xmlns="urn:evil"'), 2, 'refused'],
    ['<Other/>', 2, 'unsupported'], [Buffer.from([0xC3, 0x28]), 2, 'refused'],
  ]) {
    const result = cli(input);
    assert.equal(result.status, code, result.stderr);
    assert.equal(JSON.parse(result.stdout).verdict, verdict);
  }
});

test("attribute and namespace bounds reject amplification without stressing memory", () => {
  const attributes = Array.from({ length: 64 }, (_, i) => ` k${i}="v"`).join('');
  assert.equal(run(invoice().replace('<b:ID>EXAMPLE-1', `<b:ID${attributes}>EXAMPLE-1`)).output.verdict, 'pass');
  const tooManyAttrs = run(invoice().replace('<b:ID>EXAMPLE-1', `<b:ID${attributes} extra="v">EXAMPLE-1`));
  assert.equal(tooManyAttrs.output.verdict, 'refused');
  assert.match(tooManyAttrs.output.reason, /64 attributes/);

  // Root already has default, b, a and built-in xml bindings: sixty more is the limit.
  const declarations = Array.from({ length: 60 }, (_, i) => ` xmlns:n${i}="urn:n${i}"`).join('');
  const atLimit = invoice().replace('<Invoice xmlns=', `<Invoice${declarations} xmlns=`);
  const wide = atLimit.replace('</Invoice>', '<b:Note/>'.repeat(2000) + '</Invoice>');
  assert.equal(run(wide).output.verdict, 'pass');
  const tooManyNs = run(atLimit.replace('<b:ID>EXAMPLE-1', '<b:ID xmlns:extra="urn:extra">EXAMPLE-1'));
  assert.equal(tooManyNs.output.verdict, 'refused');
  assert.match(tooManyNs.output.reason, /64 namespace bindings/);

  // A child's rebinding must not mutate an inherited map shared by later siblings.
  assert.equal(run(invoice().replace('<b:ID>EXAMPLE-1', '<b:Note xmlns:b="urn:local">inert</b:Note><b:ID>EXAMPLE-1')).output.verdict, 'pass');
});

test("verdicts never echo arbitrary invoice content into supplier drafts", () => {
  const marker = 'PRIVATE-INVOICE-NOTE-DO-NOT-ECHO';
  const result = run(invoice(marker).replace('Example supplier', marker));
  assert.equal(result.output.verdict, "fail");
  assert.ok(!JSON.stringify(result.output).includes(marker));
});
