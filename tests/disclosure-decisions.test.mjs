import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCommunication, toBaseUnits, assessCap } from '../skills/mermail-responsible-disclosure/scripts/decisions.mjs';

const report = { scanStatus: 'clean', safeInterpretation: true, missingFields: [], ownerRecipientSelected: true };
test('high-impact missing evidence produces only escalation, carrying missing fields', () => {
  const result = chooseCommunication({ ...report, highImpact: true, missingFields: ['version', 'version', 'timing'] });
  assert.equal(result.outcome, 'escalation_proposed');
  assert.deepEqual(result.missingFields, ['version', 'timing']);
  assert.equal(result.walletAllowed, false);
  assert.equal(result.authorizesEffect, false);
});
test('sensitive and extortion cases need owner review even without selected recipient', () => {
  for (const flag of ['sensitive', 'extortion', 'policyAmbiguous']) {
    const result = chooseCommunication({ ...report, [flag]: true, ownerRecipientSelected: false });
    assert.equal(result.outcome, 'owner_review_required');
  }
});
test('unknown/failed scan and unsafe interpretation stay metadata-only', () => {
  for (const scanStatus of [undefined, 'failed', 'flagged', 'unknown']) {
    const result = chooseCommunication({ ...report, scanStatus, acknowledgmentRequested: true });
    assert.equal(result.outcome, 'escalation_proposed');
    assert.equal(result.metadataOnly, true);
  }
  assert.equal(chooseCommunication({ ...report, safeInterpretation: false }).metadataOnly, true);
});
test('one clarification, requested acknowledgment or packet; never creates delivery authority', () => {
  assert.equal(chooseCommunication({ ...report, missingFields: ['version'], acknowledgmentRequested: true }).outcome, 'clarification_proposed');
  assert.equal(chooseCommunication({ ...report, acknowledgmentRequested: true }).outcome, 'acknowledgment_proposed');
  assert.equal(chooseCommunication(report).outcome, 'packet_only');
});
test('exact conversion uses token precision without floating point rounding', () => {
  assert.equal(toBaseUnits('2500', 6), 2500000000n);
  assert.equal(toBaseUnits('0.000000000000000001', 18), 1n);
  assert.equal(toBaseUnits('999999999999999999999999999999.12', 2), 99999999999999999999999999999912n);
});
test('reject excess decimals, exponent, signs, unsafe numbers and malformed precision', () => {
  for (const value of ['0.001', '1e3', '-1', '+1', 'NaN', '1.', ' 1', 1.25, '01'])
    assert.throws(() => toBaseUnits(value, 2));
  for (const decimals of [-1, 37, 1.2, true, '6']) assert.throws(() => toBaseUnits('1', decimals));
});
const ledger = { ledgerComplete: true, atomicReservationAvailable: true, caseAlreadyReserved: false,
  assetIdentity: 'test-mint', network: 'test-network', windowId: '2026-10-18-owner-tz',
  award: '0.20', decimals: 2, perAwardCap: '1', windowCap: '0.30', entries: [] };
const row = (status, amount = '0.10', intentId = status) => ({ assetIdentity: ledger.assetIdentity,
  network: ledger.network, windowId: ledger.windowId, intentId, status, amount });
test('pending, unknown and reserved awards consume caps exactly like settled', () => {
  for (const status of ['settled', 'reserved', 'pending', 'unknown']) {
    const exact = assessCap({ ...ledger, entries: [row(status)] });
    assert.equal(exact.status, 'within_arithmetic_caps');
    assert.equal(exact.remainingAfterAwardBaseUnits, '0');
    assert.equal(exact.authorizesEffect, false);
    assert.equal(exact.requiresActualAtomicReservation, true);
    assert.equal(assessCap({ ...ledger, award: '0.21', entries: [row(status)] }).reason, 'window_cap_exceeded');
  }
});
test('missing durable coordination or prior case reservation blocks review eligibility', () => {
  for (const override of [{ ledgerComplete: false }, { atomicReservationAvailable: false },
    { caseAlreadyReserved: true }, { caseAlreadyReserved: undefined }])
    assert.equal(assessCap({ ...ledger, ...override }).status, 'manual_review');
});
test('duplicate intents, mixed groups and unknown states cannot silently change totals', () => {
  for (const entries of [[row('settled'), row('settled')], [{ ...row('settled'), network: 'other' }],
    [{ ...row('settled'), assetIdentity: 'other-mint' }], [{ ...row('settled'), windowId: 'other-day' }],
    [row('new-status')], [{ ...row('settled'), intentId: ' ' }]])
    assert.equal(assessCap({ ...ledger, entries }).status, 'manual_review');
});
test('release requires definitive evidence; zero/excessive award and invalid values fail closed', () => {
  assert.equal(assessCap({ ...ledger, entries: [row('released_definitively')] }).reason, 'unverified_release');
  assert.equal(assessCap({ ...ledger, entries: [{ ...row('released_definitively'), authoritativeRelease: true }] }).usedBaseUnits, '0');
  for (const award of ['0', '1.01', '-2', 'NaN', 0.2])
    assert.equal(assessCap({ ...ledger, award }).status, 'manual_review');
  assert.equal(assessCap({ ...ledger, entries: Array(201).fill(row('settled')) }).status, 'manual_review');
});
