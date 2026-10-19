import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPatterns, projectMonthly } from '../skills/mermail-renewal-guard/scripts/history.mjs';
const scope = { workspaceId: 'w', mailboxId: 'm', asOf: '2026-10-19' };
const row = patch => ({ ...scope, sourceId: 's1', vendorId: 'vendor', accountId: 'account', planId: 'pro',
  currency: 'USD', amount: '9.99', eventId: 'event1', chargeDate: '2026-07-01', direction: 'charge', documentKind: 'receipt',
  dateEvidence: 'stated', scanStatus: 'clean', contentOmitted: false, senderAuthentication: 'pass', ...patch });
const three = () => [row(), row({ sourceId: 's2', eventId: 'event2', chargeDate: '2026-08-01' }), row({ sourceId: 's3', eventId: 'event3', chargeDate: '2026-09-01' })];
const terms = patch => row({ currentTermsConfirmed: true, cadenceEvidence: 'stated', cadence: 'monthly', ...patch });

test('historical monthly candidate is derived only, never payment or cancellation authority', () => {
  const result = detectPatterns(scope, three());
  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].cadenceCandidate, 'monthly');
  assert.equal(result.patterns[0].distinctEvents, 3);
  assert.equal(result.patterns[0].estimatedNextRange.from, '2026-10-02');
  assert.equal(result.authorizesEffect, false);
  assert.equal(result.settlementVerified, false);
});
test('copied receipts and duplicate source observations do not manufacture recurrence', () => {
  assert.equal(detectPatterns(scope, [row(), row(), row({ sourceId: 'copy' })]).patterns.length, 0);
  assert.throws(() => detectPatterns(scope, [row(), row({ amount: '99' })]));
  assert.throws(() => detectPatterns(scope, [row(), row({ sourceId: 'copy', amount: '99' })]));
});
test('account plan and currency are never grouped just by sender or equal amount', () => {
  for (const patch of [{ accountId: 'other' }, { planId: 'other' }, { currency: 'EUR' }])
    assert.equal(detectPatterns(scope, [row(), row({ ...patch, sourceId: 's2', eventId: 'e2', chargeDate: '2026-08-01' })]).patterns.length, 0);
});
test('two events remain weak, irregular gaps have no next-charge prediction', () => {
  assert.equal(detectPatterns(scope, three().slice(0, 2)).patterns[0].confidence, 'weak_candidate');
  const result = detectPatterns(scope, [row(), row({ sourceId: 's2', eventId: 'e2', chargeDate: '2026-07-04' })]);
  assert.equal(result.patterns[0].estimatedNextRange, null);
});
test('same-day distinct events are not a recurring cadence', () => {
  const result = detectPatterns(scope, [row(), row({ sourceId: 's2', eventId: 'e2' })]);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.needsReview[0].reason, 'same_day_events_not_cadence');
});
test('unknown scan auth omitted future ambiguous and refund sources are not charge evidence', () => {
  for (const patch of [{ scanStatus: 'unknown' }, { senderAuthentication: 'unknown' }, { contentOmitted: true },
    { chargeDate: '2026-02-30' }, { chargeDate: '2027-01-01' }, { direction: 'refund' }, { dateEvidence: 'derived' },
    { documentKind: 'invoice' }, { amount: 'NaN' }, { amount: -3 }, { amount: '0' }]) {
    const result = detectPatterns(scope, [row(patch)]);
    assert.equal(result.patterns.length, 0);
    assert.equal(result.needsReview.length, 1);
  }
});
test('wrong workspace/mailbox or oversize records fail instead of blending histories', () => {
  for (const patch of [{ workspaceId: 'other' }, { mailboxId: 'other' }]) {
    assert.throws(() => detectPatterns(scope, [row(patch)]));
    assert.throws(() => projectMonthly(scope, [terms(patch)]));
  }
  assert.throws(() => detectPatterns(scope, Array(201).fill(row())));
  assert.throws(() => detectPatterns({ ...scope, asOf: 'yesterday' }, []));
});
test('exact decimal and quarterly/annual monthly equivalents stay separated by currency', () => {
  const result = projectMonthly(scope, [terms({ amount: '0.10' }), terms({ accountId: 'a2', amount: '0.20' }),
    terms({ accountId: 'annual', amount: '120', cadence: 'annual' }), terms({ currency: 'EUR', amount: '30', cadence: 'quarterly' })]);
  assert.deepEqual(result.totals.map(x => [x.currency, x.exactDecimal]), [['USD', '10.3'], ['EUR', '10']]);
  assert.equal(result.authorizesEffect, false);
});
test('rational thirds never round money or invent monthly cashflow', () => {
  const result = projectMonthly(scope, [terms({ amount: '1', cadence: 'quarterly' })]);
  assert.equal(result.totals[0].exactDecimal, null);
  assert.equal(result.totals[0].denominator, '3');
  assert.match(result.basis, /not_cashflow/);
});
test('unknown cadence and historical estimates cannot become current budget terms', () => {
  for (const patch of [{ currentTermsConfirmed: false }, { cadenceEvidence: 'inferred' }, { cadence: 'weekly' }, { cadence: '__proto__' }]) {
    const result = projectMonthly(scope, [terms(patch)]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.needsReview.length, 1);
  }
});
test('repeated same terms count once and conflicting current terms block', () => {
  assert.equal(projectMonthly(scope, [terms(), terms({ sourceId: 'copy' })]).rows.length, 1);
  assert.throws(() => projectMonthly(scope, [terms(), terms({ sourceId: 'new', amount: '10' })]));
});
