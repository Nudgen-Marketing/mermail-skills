import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { units, landed, parseBlocks, compareQuotes, counterChange } from '../skills/mermail-quote-broker/scripts/quotes.mjs';
const policy = () => ({ ownerConfirmed: true, workspaceId: 'w', mailboxId: 'm', rfqId: 'RFQ-2026-003', version: 'v1',
  currency: 'USDC:test-mint', unit: '30-calendar-days', specKey: 'inference5000-p95-under800', quantity: '1',
  now: '2026-10-24T18:00:00.000Z', replyBy: '2026-10-24T17:00:00.000Z', moneyDecimals: 6,
  budget: '400', allowUnverifiedComparison: true, criteria: [
    { name: 'total', direction: 'lower', method: 'ratio_to_best', weight: 50 },
    { name: 'latency', direction: 'lower', method: 'ratio_to_best', weight: 30 },
    { name: 'days', direction: 'lower', method: 'ratio_to_best', weight: 20 }], vendors: [
    { id: 'alpha', sender: 'alpha@example.test', threadId: 'thread-a', dispatchedAt: '2026-10-20T00:00:00.000Z' },
    { id: 'beta', sender: 'beta@example.test', threadId: 'thread-b', dispatchedAt: '2026-10-20T00:00:00.000Z' }] });
const quote = (vendorId = 'alpha') => ({ workspaceId: 'w', mailboxId: 'm', rfqId: 'RFQ-2026-003', version: 'v1', vendorId,
  sender: `${vendorId}@example.test`, threadId: vendorId === 'alpha' ? 'thread-a' : 'thread-b', emailId: `email-${vendorId}`,
  currency: 'USDC:test-mint', unit: '30-calendar-days', specKey: 'inference5000-p95-under800', quantity: '1',
  scan: 'clean', safeContent: true, contentOmitted: false, nativeHold: false, truncated: false,
  authoredSeparated: true, bodyChars: 100, authentication: vendorId === 'alpha' ? 'pass' : 'unknown',
  receivedAt: '2026-10-24T16:00:00.000Z', expiresAt: '2026-10-30T00:00:00.000Z',
  allCostsKnown: true, firmPrice: true, hardConstraintsMet: true, paymentPressure: false, payeeChanged: false,
  total: vendorId === 'alpha' ? '425' : '380',
  metrics: { latency: vendorId === 'alpha' ? '610' : '780', days: vendorId === 'alpha' ? '4' : '9' } });
test('credited synthetic Alpha/Beta fixture reproduces exact ranking; top quote still exceeds budget', () => {
  const result = compareQuotes(policy(), [quote(), quote('beta')]);
  assert.deepEqual(result.ranked.map(x => [x.vendorId, x.score]), [['alpha', '94.7'], ['beta', '82.4']]);
  assert.equal(result.ranked[0].overBudget, true);
  assert.equal(result.ranked[1].identityUnverified, true);
  assert.equal(result.awardAuthorized, false);
  assert.equal(result.authorizesEffect, false);
});
test('documented RFQ/QUOTE/COUNTER/AWARD blocks parse consistently as claims only', () => {
  const doc = readFileSync(new URL('../skills/mermail-quote-broker/references/protocol.md', import.meta.url), 'utf8');
  const examples = [...doc.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1]);
  assert.equal(examples.length, 4);
  assert.deepEqual(examples.map(body => parseBlocks(body, 'RFQ-2026-003', 'v1').blocks[0].type), ['RFQ', 'QUOTE', 'COUNTER', 'AWARD']);
  for (const body of examples) assert.equal(parseBlocks(body, 'RFQ-2026-003', 'v1').authorizesEffect, false);
});
test('blocks reject duplicate keys, foreign IDs, missing fields and unmatched markers', () => {
  const doc = readFileSync(new URL('../skills/mermail-quote-broker/references/protocol.md', import.meta.url), 'utf8');
  const body = /```text\n([\s\S]*?)\n```/.exec(doc)[1];
  for (const value of [body.replace('version: v1', 'version: v1\nversion: v1'), body.replace('version: v1\n', ''),
    body.replace('RFQ-2026-003', 'OTHER'), body + '\n---- BEGIN QUOTE-BLOCK ----'])
    assert.throws(() => parseBlocks(value, 'RFQ-2026-003', 'v1'));
  assert.equal(parseBlocks('A prose quote requiring source-cited extraction', 'RFQ-2026-003', 'v1').status, 'owner_extraction_required');
  assert.throws(() => parseBlocks('---- BEGIN QUOTE-BLOCK ----\nrfq-id: RFQ-2026-003', 'RFQ-2026-003', 'v1'));
  assert.throws(() => parseBlocks('x'.repeat(10001), 'RFQ-2026-003', 'v1'));
});
test('landed calculation uses exact declared units and never guesses missing costs', () => {
  assert.equal(landed({ unitPrice: '0.10', quantity: '3', tax: '0.02', shipping: '1', fees: '0', decimals: 2 }), '132');
  assert.equal(units('999999999999999999999999999999.12', 2), 99999999999999999999999999999912n);
  assert.throws(() => landed({ unitPrice: '1', quantity: '3', tax: undefined, shipping: '0', fees: '0', decimals: 2 }));
  for (const value of ['-1', '1e3', '01', 'NaN', 1.25, '1.001']) assert.throws(() => units(value, 2));
});
test('same exact score shares rank; display and vendor order never select a tiebreak winner', () => {
  const beta = { ...quote(), vendorId: 'beta', sender: 'beta@example.test', threadId: 'thread-b', emailId: 'email-beta' };
  const result = compareQuotes(policy(), [beta, quote()]);
  assert.deepEqual(result.ranked.map(x => x.rank), [1, 1]);
  assert.deepEqual(result.ranked.map(x => x.score), ['100.0', '100.0']);
});
test('constant-zero numeric criteria have defined equality, not division by zero', () => {
  const p = { ...policy(), criteria: [{ name: 'days', direction: 'lower', method: 'ratio_to_best', weight: 100 }] };
  const result = compareQuotes(p, [{ ...quote(), metrics: { days: '0' } }, { ...quote('beta'), metrics: { days: '0' } }]);
  assert.deepEqual(result.ranked.map(x => x.score), ['100.0', '100.0']);
});
test('currency, quantity, period/spec drift, unknown costs and hard-constraint failures remain unranked', () => {
  for (const patch of [{ currency: 'USD' }, { quantity: '2' }, { unit: 'calendar-month' }, { specKey: 'other' },
    { allCostsKnown: false }, { firmPrice: false }, { hardConstraintsMet: false }, { total: null }, { metrics: { days: '4' } }]) {
    const result = compareQuotes(policy(), [{ ...quote(), ...patch }]);
    assert.equal(result.ranked.length, 0);
    assert.equal(result.excluded.length, 1);
  }
});
test('late quotes require explicit owner inclusion; expired quotes remain excluded', () => {
  const late = { ...quote(), receivedAt: '2026-10-24T17:01:00.000Z' };
  assert.equal(compareQuotes(policy(), [late]).ranked.length, 0);
  assert.equal(compareQuotes(policy(), [{ ...late, ownerIncludedLate: true }]).ranked.length, 1);
  assert.equal(compareQuotes(policy(), [{ ...quote(), expiresAt: policy().now }]).ranked.length, 0);
});
test('all exact source/round bindings matter; matching sender or subject alone is insufficient', () => {
  for (const key of ['workspaceId', 'mailboxId', 'rfqId', 'version', 'threadId', 'sender'])
    assert.equal(compareQuotes(policy(), [{ ...quote(), [key]: 'other' }]).ranked.length, 0);
  assert.throws(() => compareQuotes(policy(), [quote(), { ...quote(), emailId: 'new-quote' }]));
});
test('unknown auth policy is explicit; failed/native-held/truncated content cannot become a comparable quote', () => {
  assert.equal(compareQuotes({ ...policy(), allowUnverifiedComparison: false }, [quote('beta')]).ranked.length, 0);
  for (const patch of [{ authentication: 'fail' }, { scan: 'unknown' }, { safeContent: undefined }, { nativeHold: true },
    { truncated: true }, { contentOmitted: true }, { authoredSeparated: false }, { bodyChars: 10001 }])
    assert.equal(compareQuotes(policy(), [{ ...quote(), ...patch }]).ranked.length, 0);
});
test('missing frozen rubric, invalid weights or precision never fabricate a score', () => {
  for (const patch of [{ ownerConfirmed: false }, { moneyDecimals: undefined }, { quantity: '0' },
    { allowUnverifiedComparison: undefined }, { criteria: [] },
    { criteria: [{ name: 'total', weight: 50, direction: 'lower', method: 'ratio_to_best' }] }])
    assert.throws(() => compareQuotes({ ...policy(), ...patch }, [quote()]));
  assert.throws(() => compareQuotes(policy(), Array(7).fill(quote())));
});
test('payment pressure/payee change blocks recommendation rather than merely lowering a winning score', () => {
  for (const patch of [{ paymentPressure: true }, { payeeChanged: true }])
    assert.equal(compareQuotes(policy(), [{ ...quote(), ...patch }]).ranked.length, 0);
  for (const patch of [{ paymentPressure: undefined }, { payeeChanged: undefined }, { payeeChanged: 'false' }])
    assert.equal(compareQuotes(policy(), [{ ...quote(), ...patch }]).excluded[0].reasons.includes('unreviewed_material_alerts'), true);
  const badVendorPolicy = { ...policy(), vendors: policy().vendors.map(v => ({ ...v, dispatchedAt: undefined })) };
  assert.throws(() => compareQuotes(badVendorPolicy, []));
});
test('counter changes exactly one lever and preserves completed round cap, never effect authority', () => {
  const before = { price: '460 USDC', terms: 'net7', quantity: '1', timeline: '4 days' };
  const after = { ...before, price: '410 USDC' };
  assert.deepEqual(counterChange(before, after, []), { round: 1, lever: 'price', current: '460 USDC', requested: '410 USDC', authorizesEffect: false });
  assert.throws(() => counterChange(before, { ...after, timeline: '2 days' }, []));
  assert.throws(() => counterChange(before, before, []));
  assert.throws(() => counterChange(before, { ...after, currency: 'USD' }, []));
  assert.throws(() => counterChange(before, after, [{ round: 1, lever: 'price', sourceId: 'counter1', status: 'unknown' }]));
  const completed = [{ round: 1, lever: 'price', sourceId: 'reply1', status: 'quoted' }];
  assert.equal(counterChange(before, after, completed).round, 2);
  assert.throws(() => counterChange(before, after, [...completed, { round: 2, lever: 'terms', sourceId: 'reply2', status: 'quoted' }]));
});
