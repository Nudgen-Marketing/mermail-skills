import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarizeRefund } from '../skills/mermail-refund-follow-through/scripts/summarize-refund.mjs';

function packet() {
  return {
    schema_version: 1,
    scope: { mailbox_id: 'box-1', merchant_sender: 'billing@example.com', order_id: 'ORDER-42', currency: 'USD', expected_refund: '120.00', date_start: '2026-09-01T00:00:00Z', date_end: '2026-09-15T12:00:00Z', as_of: '2026-09-15T12:00:00Z' },
    coverage: { complete: true, note: 'All pages of the scoped search were checked.' },
    sources: [{ email_id: 'email-1', mailbox_id: 'box-1', from: 'billing@example.com', date: '2026-09-14T10:00:00Z', scan_status: 'clean', sender_authentication: { status: 'pass' }, content_omitted: false, text: 'ORDER-42: processed USD 45.00; refund reference RF-1.' }],
    observations: [{ email_id: 'email-1', kind: 'processed', amount: '45.00', currency: 'USD', refund_id: 'RF-1', quote: 'ORDER-42: processed USD 45.00; refund reference RF-1.' }],
  };
}
function addNotice(p, { id = 'email-2', amount = '45.00', reference = 'RF-1', kind = 'processed' } = {}) {
  const quote = `ORDER-42: ${kind} USD ${amount}; refund reference ${reference}.`;
  p.sources.push({ ...p.sources[0], email_id: id, text: quote });
  p.observations.push({ email_id: id, kind, amount, currency: 'USD', refund_id: reference, quote });
}
function excludedFor(p, reason) {
  const summary = summarizeRefund(p);
  assert.equal(summary.notices.processed_total, '0.00');
  assert.ok(summary.evidence.excluded[0].reasons.includes(reason), JSON.stringify(summary.evidence.excluded));
  return summary;
}

test('45 of 120 is provider-reported notice evidence, with bank credit unverified', () => {
  const p = packet();
  const original = JSON.stringify(p);
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '45.00');
  assert.equal(result.notices.amount_not_explained_by_notices, '75.00');
  assert.equal(result.assessment.bank_credit, 'unverified');
  assert.deepEqual(result.notices.processed_refunds[0].evidence_ids, ['observation:1']);
  assert.match(result.limitations[0], /do not establish actual bank credit/);
  assert.equal(JSON.stringify(p), original);
});

test('the same reference in repeated and quoted email is counted once', () => {
  const p = packet();
  addNotice(p);
  p.sources[1].text = `Previous message follows:\n${p.sources[1].text}\nEnd quoted message.`;
  p.observations.push({ ...p.observations[0] });
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '45.00');
  assert.deepEqual(result.notices.evidence_ids, ['observation:1', 'observation:2', 'observation:3']);
  assert.equal(result.evidence.duplicates.length, 2);
});

test('different references sum using exact decimals and floor unexplained amount at zero', () => {
  const p = packet();
  addNotice(p, { reference: 'RF-2', amount: '90.000001' });
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '135.000001');
  assert.equal(result.notices.amount_not_explained_by_notices, '0.000000');
  assert.ok(result.assessment.warnings.includes('processed_notices_exceed_expected_refund'));
});

test('equivalent decimal spellings for the same reference are duplicates, not conflicts', () => {
  const p = packet();
  addNotice(p, { amount: '45.000000' });
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '45.000000');
  assert.equal(result.conflicts.length, 0);
});

test('conflicting amounts for a reference disable all numeric aggregates', () => {
  const p = packet();
  addNotice(p, { amount: '46.00' });
  addNotice(p, { id: 'email-3', reference: 'RF-2', amount: '10.00' });
  const result = summarizeRefund(p);
  assert.equal(result.assessment.status, 'evidence_conflict');
  assert.equal(result.notices.processed_total, null);
  assert.equal(result.notices.amount_not_explained_by_notices, null);
  assert.equal(result.notices.total_basis, 'unavailable_due_to_conflict');
  assert.equal(result.notices.processed_refunds[0].amount, null);
  assert.deepEqual(result.conflicts[0].evidence_ids, ['observation:1', 'observation:2']);
});

test('a reversal triggers manual review and is never silently subtracted', () => {
  const p = packet();
  addNotice(p, { kind: 'reversed' });
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, null);
  assert.equal(result.notices.amount_not_explained_by_notices, null);
  assert.equal(result.conflicts[0].reason, 'reversal_requires_manual_review');
});

test('a reversal without an amount still blocks an aggregate, including with partial coverage', () => {
  const p = packet();
  addNotice(p, { kind: 'reversed' });
  p.observations[1].amount = null;
  p.sources[1].text = p.observations[1].quote = 'ORDER-42: refund RF-1 was reversed.';
  p.coverage.complete = false;
  const result = summarizeRefund(p);
  assert.equal(result.assessment.status, 'evidence_conflict');
  assert.equal(result.notices.processed_total, null);
  assert.match(result.limitations.at(-1), /prevents a numeric aggregate/);
});

test('wrong order, including an order ID prefix, and wrong currency are excluded', () => {
  for (const order of ['ORDER-43', 'ORDER-420']) {
    const p = packet();
    p.sources[0].text = p.observations[0].quote = p.observations[0].quote.replace('ORDER-42', order);
    excludedFor(p, 'order_not_in_quote');
  }
  const p = packet();
  p.observations[0].currency = 'EUR';
  p.sources[0].text = p.observations[0].quote = p.observations[0].quote.replace('USD', 'EUR');
  excludedFor(p, 'wrong_currency');
});

test('order and refund references reject punctuation-delimited and Unicode near-matches', () => {
  for (const [field, expectedReason] of [['order_id', 'order_not_in_quote'], ['refund_id', 'refund_reference_not_in_quote']]) {
    for (const [prefix, suffix] of [['', '.7'], ['', '/7'], ['', ':7'], ['', '.extra'], ['extra.', ''], ['extra/', ''], ['extra:', ''], ['', '\uFF17'], ['', '\uFF0E7'], ['', '\u200d7'], ['', '\u03017'], ['', '\u{10400}']]) {
      const p = packet();
      const original = field === 'order_id' ? p.scope.order_id : p.observations[0].refund_id;
      p.sources[0].text = p.observations[0].quote = p.observations[0].quote.replace(original, `${prefix}${original}${suffix}`);
      excludedFor(p, expectedReason);
    }
  }
});

test('identifiers allow exact internal punctuation and preserve surrounding sentence punctuation', () => {
  const p = packet();
  p.scope.order_id = 'ORDER-42.7/A:B_9';
  p.observations[0].refund_id = 'RF-1.7/A:B_9';
  p.sources[0].text = p.observations[0].quote = `“${p.scope.order_id}”: processed USD 45.00; refund reference (${p.observations[0].refund_id}).`;
  assert.equal(summarizeRefund(p).notices.processed_total, '45.00');
  assert.equal(summarizeRefund(packet()).notices.processed_total, '45.00');
});

test('invalid scoped order and refund identifiers are rejected without normalization', () => {
  for (const id of ['ORDER-42.', '/ORDER-42', 'ORDER 42', 'ORDER-\uFF14\uFF12', 'ORDER-42\u200d', '#ORDER-42']) {
    const p = packet(); p.scope.order_id = id;
    assert.throws(() => summarizeRefund(p), /ASCII identifier/);
    p.scope.order_id = 'ORDER-42'; p.observations[0].refund_id = id;
    assert.throws(() => summarizeRefund(p), /ASCII identifier/);
  }
});

test('unknown or failed authentication, unsafe scan, and omitted body fail closed', () => {
  for (const [change, reason] of [
    [s => { s.sender_authentication.status = 'unknown'; }, 'authentication_unknown'],
    [s => { s.sender_authentication.status = 'fail'; }, 'authentication_not_pass'],
    [s => { s.scan_status = 'suspicious'; }, 'scan_not_clean'],
    [s => { s.content_omitted = true; }, 'body_omitted'],
  ]) {
    const p = packet(); change(p.sources[0]);
    const result = excludedFor(p, reason);
    assert.ok(result.evidence.uncertain[0].reasons.includes(reason));
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.declared_complete, true);
    assert.deepEqual(result.coverage.gaps[0], { email_id: 'email-1', reasons: [reason] });
  }
});

test('truncated content is excluded and downgrades claimed complete coverage', () => {
  const p = packet();
  p.sources[0].content_truncated = true;
  const result = excludedFor(p, 'body_truncated');
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.declared_complete, true);
  assert.equal(result.assessment.status, 'partial_coverage');
  assert.equal(result.notices.total_basis, 'lower_bound');
  assert.ok(result.assessment.warnings.includes('source_evidence_gaps'));
  assert.match(result.limitations.join(' '), /Excluded content may contain contrary evidence/);
});

test('metadata-only matched unsafe sources downgrade coverage without an observation', () => {
  const p = packet();
  p.sources.push({ ...p.sources[0], email_id: 'email-2', text: '', content_omitted: true });
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '45.00');
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.coverage.gaps, [{ email_id: 'email-2', reasons: ['body_omitted'] }]);
});

test('unsafe sources outside the mailbox, sender, or date scope do not create coverage gaps', () => {
  for (const change of [s => { s.mailbox_id = 'box-2'; }, s => { s.from = 'other@example.com'; }, s => { s.date = '2026-09-16T00:00:00Z'; }, s => { s.date = '2026-08-31T23:59:59Z'; }]) {
    const p = packet();
    const source = { ...p.sources[0], email_id: 'email-2', content_truncated: true };
    change(source); p.sources.push(source);
    const result = summarizeRefund(p);
    assert.equal(result.coverage.complete, true);
    assert.deepEqual(result.coverage.gaps, []);
  }
});

test('content_truncated is optional boolean and participates in duplicate conflict checking', () => {
  const p = packet();
  p.sources.push({ ...p.sources[0], content_truncated: false });
  assert.equal(summarizeRefund(p).coverage.complete, true);
  p.sources[1].content_truncated = true;
  assert.throws(() => summarizeRefund(p), /conflicting duplicate email_id/);
  p.sources.pop(); p.sources[0].content_truncated = 'false';
  assert.throws(() => summarizeRefund(p), /content_truncated.*boolean/);
});

test('wrong mailbox and misleading display names fail closed; case-normalized exact sender works', () => {
  let p = packet(); p.sources[0].mailbox_id = 'box-2'; excludedFor(p, 'wrong_mailbox');
  p = packet(); p.sources[0].from = 'billing@example.com <attacker@example.org>'; excludedFor(p, 'sender_not_plain_address');
  p = packet(); p.sources[0].from = 'billing@example.com.attacker.org'; excludedFor(p, 'wrong_sender');
  p = packet(); p.sources[0].from = ' BILLING@EXAMPLE.COM ';
  assert.equal(summarizeRefund(p).notices.processed_total, '45.00');
});

test('missing source, inexact quote, amount, currency, and refund reference are excluded', () => {
  const cases = [
    [p => { p.observations[0].email_id = 'absent'; }, 'source_not_found'],
    [p => { p.observations[0].quote += ' invented text'; }, 'quote_not_exact_substring'],
    [p => { p.observations[0].amount = '5.00'; }, 'exact_amount_not_in_quote'],
    [p => { p.sources[0].text = p.observations[0].quote = 'ORDER-42: processed 45.00; refund reference RF-1.'; }, 'currency_not_in_quote'],
    [p => { p.observations[0].refund_id = null; }, 'missing_refund_reference'],
    [p => { p.observations[0].refund_id = 'RF'; }, 'refund_reference_not_in_quote'],
    [p => { p.observations[0].amount = null; }, 'missing_amount'],
  ];
  for (const [change, reason] of cases) { const p = packet(); change(p); excludedFor(p, reason); }
});

test('promises, authorizations and unclear observations never count as processed notices', () => {
  for (const kind of ['promised', 'authorization_release', 'unclear']) {
    const p = packet();
    p.observations[0].kind = kind;
    const result = summarizeRefund(p);
    assert.equal(result.notices.processed_total, '0.00');
    assert.equal(result.evidence.accepted.length, 1);
    assert.equal(result.evidence.uncertain.length, 1);
  }
});

test('future evidence is excluded using the actual timezone offset', () => {
  const p = packet();
  p.sources[0].date = '2026-09-15T08:00:00-05:00';
  excludedFor(p, 'after_as_of');
  p.sources[0].date = '2026-09-15T07:00:00-05:00';
  assert.equal(summarizeRefund(p).notices.processed_total, '45.00');
});

test('the date window is inclusive and preserves exact supplied boundaries', () => {
  const p = packet();
  for (const date of [p.scope.date_start, p.scope.date_end]) {
    p.sources[0].date = date;
    const result = summarizeRefund(p);
    assert.equal(result.notices.processed_total, '45.00');
    assert.equal(result.scope.date_start, p.scope.date_start);
    assert.equal(result.scope.date_end, p.scope.date_end);
  }
  p.sources[0].date = '2026-08-31T19:00:00-05:00';
  assert.equal(summarizeRefund(p).notices.processed_total, '45.00');
  p.sources[0].date = '2026-08-31T23:59:59.999Z';
  excludedFor(p, 'before_date_start');
});

test('date_end and as_of are independent exclusion reasons with the earlier effective cutoff', () => {
  const p = packet();
  p.scope.date_end = '2026-09-14T12:00:00Z';
  p.sources[0].date = '2026-09-14T12:00:00.001Z';
  let result = excludedFor(p, 'after_date_end');
  assert.deepEqual(result.evidence.excluded[0].reasons, ['after_date_end']);
  p.scope.date_end = '2026-09-16T12:00:00Z';
  p.sources[0].date = '2026-09-15T12:00:00.001Z';
  result = excludedFor(p, 'after_as_of');
  assert.deepEqual(result.evidence.excluded[0].reasons, ['after_as_of']);
  p.sources[0].date = p.scope.as_of;
  assert.equal(summarizeRefund(p).notices.processed_total, '45.00');
});

test('unsafe context outside a declared date window does not downgrade active coverage', () => {
  const p = packet();
  p.scope.date_end = '2026-09-14T12:00:00Z';
  p.sources.push({ ...p.sources[0], email_id: 'old-context', date: '2026-08-31T23:59:59.999Z', content_omitted: true });
  p.sources.push({ ...p.sources[0], email_id: 'later-context', date: '2026-09-14T12:00:00.001Z', content_truncated: true });
  p.sources.push({ ...p.sources[0], email_id: 'future-context', date: '2026-09-16T12:00:00Z', content_truncated: true });
  const result = summarizeRefund(p);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.coverage.gaps, []);
});

test('date boundaries are required and reject reversed or not-yet-started windows', () => {
  for (const field of ['date_start', 'date_end']) {
    const p = packet(); delete p.scope[field];
    assert.throws(() => summarizeRefund(p), new RegExp(`scope.${field}`));
    p.scope[field] = '2026-09-01T00:00:00';
    assert.throws(() => summarizeRefund(p), /timestamp/);
  }
  let p = packet(); p.scope.date_end = '2026-08-31T00:00:00Z';
  assert.throws(() => summarizeRefund(p), /date_end.*at or after date_start/);
  p = packet(); p.scope.as_of = '2026-08-31T00:00:00Z';
  assert.throws(() => summarizeRefund(p), /as_of.*at or after date_start/);
});

test('partial coverage is prominent and marks the qualifying notice total as a lower bound', () => {
  const p = packet();
  p.coverage = { complete: false, note: 'Only the first search page was available.' };
  const result = summarizeRefund(p);
  assert.equal(result.assessment.status, 'partial_coverage');
  assert.equal(result.notices.total_basis, 'lower_bound');
  assert.ok(result.assessment.warnings.includes('partial_mailbox_coverage'));
  assert.match(result.limitations.at(-1), /lower bound/);
});

test('identical source duplicates are flagged and conflicting duplicate source IDs are rejected', () => {
  const p = packet();
  p.sources.push(structuredClone(p.sources[0]));
  assert.equal(summarizeRefund(p).evidence.duplicates[0].reason, 'duplicate_source');
  p.sources[1].sender_authentication.status = 'fail';
  assert.throws(() => summarizeRefund(p), /conflicting duplicate email_id/);
});

test('malformed, unzoned and normalized-overflow calendar timestamps are rejected', () => {
  for (const date of ['yesterday', '2026-09-14', '2026-09-14T10:00:00', '2026-02-30T10:00:00Z', '2026-02-29T10:00:00Z', '2026-09-14T24:00:00Z', '2026-09-14T10:00:00+24:00', '2026-09-14T10:00:00.1234Z']) {
    const p = packet(); p.sources[0].date = date;
    assert.throws(() => summarizeRefund(p), /timestamp|calendar/);
  }
  const p = packet(); p.scope.as_of = '2026-09-15T12:00:00';
  assert.throws(() => summarizeRefund(p), /timestamp/);
});

test('money rejects floats, exponents, signs, whitespace, leading zeroes, and excess precision', () => {
  for (const amount of [45, NaN, Infinity, '', ' 45.00', '45.00 ', '-0', '-1.00', '+0', '00', '01.00', '.5', '1.', '1e2', '0x10', '1,000.00', '1.0000001', '1000000000000']) {
    const p = packet(); p.observations[0].amount = amount;
    assert.throws(() => summarizeRefund(p), /decimal string/);
    p.observations[0].amount = '45.00'; p.scope.expected_refund = amount;
    assert.throws(() => summarizeRefund(p), /decimal string/);
  }
});

test('zero amounts are valid only when the exact zero token is present', () => {
  const p = packet();
  p.scope.expected_refund = '0.000000';
  p.sources[0].text = p.observations[0].quote = 'ORDER-42: processed USD 0.000000; refund reference RF-1.';
  p.observations[0].amount = '0.000000';
  const result = summarizeRefund(p);
  assert.equal(result.notices.processed_total, '0.000000');
  assert.equal(result.notices.amount_not_explained_by_notices, '0.000000');
  for (const textAmount of ['10.00', '0.00', '-0', '+0', '0.1']) {
    p.scope.expected_refund = '120.00'; p.observations[0].amount = '0';
    p.sources[0].text = p.observations[0].quote = `ORDER-42: processed USD ${textAmount}; refund reference RF-1.`;
    excludedFor(p, 'exact_amount_not_in_quote');
  }
});

test('fixed scale arithmetic remains exact near the maximum accepted magnitude', () => {
  const p = packet();
  p.scope.expected_refund = '999999999999.999999';
  p.sources = []; p.observations = [];
  p.sources.push({ ...packet().sources[0], text: 'ORDER-42: processed USD 999999999999.999998; refund reference RF-1.' });
  p.observations.push({ ...packet().observations[0], amount: '999999999999.999998', quote: p.sources[0].text });
  assert.equal(summarizeRefund(p).notices.amount_not_explained_by_notices, '0.000001');
});

test('invalid shapes and bounded input limits are rejected', () => {
  for (const change of [
    p => { p.schema_version = 2; }, p => { p.coverage.complete = 'true'; },
    p => { p.sources[0].content_omitted = 'false'; }, p => { p.observations[0].quote = ''; },
    p => { p.observations[0].kind = 'paid'; }, p => { p.sources[0].text = 'x'.repeat(65_537); },
    p => { p.sources = Array.from({ length: 257 }, () => p.sources[0]); },
    p => { p.observations = Array.from({ length: 1025 }, () => p.observations[0]); },
    p => { p.scope.merchant_sender = 'Merchant <billing@example.com>'; },
  ]) { const p = packet(); change(p); assert.throws(() => summarizeRefund(p), TypeError); }
});

test('CLI emits JSON for a valid file and rejects malformed input without a summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refund-follow-through-'));
  try {
    const input = join(dir, 'packet.json');
    const script = fileURLToPath(new URL('../skills/mermail-refund-follow-through/scripts/summarize-refund.mjs', import.meta.url));
    writeFileSync(input, JSON.stringify(packet()));
    const good = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).notices.processed_total, '45.00');
    writeFileSync(input, '{');
    const bad = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, '');
    assert.match(bad.stderr, /Invalid refund evidence/);
    const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
