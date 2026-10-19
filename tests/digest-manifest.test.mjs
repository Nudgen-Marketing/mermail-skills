import test from 'node:test';
import assert from 'node:assert/strict';
import { projectManifest, planDelivery } from '../skills/mermail-research-digest-agent/scripts/manifest.mjs';
const scope = { workspaceId: 'w1', mailboxId: 'm1', start: '2026-10-18T00:00:00.000Z', end: '2026-10-19T00:00:00.000Z' };
const hash = 'a'.repeat(64), nextHash = 'b'.repeat(64);
const source = (id = 'source1') => ({ ...scope, id, digest: hash, scan: 'clean', safeBodyRead: true,
  keep: true, topics: ['market', 'research'], receivedAt: '2026-10-18T12:00:00.000Z' });
const previous = (status = 'sent') => ({ workspaceId: 'w1', mailboxId: 'm1', status,
  authoritativeDelivery: true, sources: [{ id: 'source1', digest: hash }] });
test('one source under two topics counts once overall; repeated observations deduplicate', () => {
  const result = projectManifest(scope, [source(), source(), source('source2')]);
  assert.equal(result.counts.uniqueCandidates, 2);
  assert.equal(result.counts.kept, 2);
  assert.deepEqual(result.topicCounts, { market: 2, research: 2 });
  assert.equal(result.included.length, 2);
  assert.equal(result.authorizesEffect, false);
  assert.equal(result.provesCompleteCoverage, false);
});
test('conflicting same-ID versions or classifications stop instead of silently selecting latest', () => {
  for (const change of [{ digest: nextHash }, { keep: false }, { scan: 'unknown' }])
    assert.throws(() => projectManifest(scope, [source(), { ...source(), ...change }]));
});
test('unsafe, omitted and unversioned bodies do not become factual digest sources', () => {
  const inputs = [{ ...source('a'), scan: 'unknown' }, { ...source('b'), safeBodyRead: false },
    { ...source('c'), digest: null }, { ...source('d'), keep: false }];
  const result = projectManifest(scope, inputs);
  assert.equal(result.counts.metadataOnly, 3);
  assert.equal(result.counts.safelyRead, 1);
  assert.equal(result.counts.dropped, 1);
  assert.equal(result.counts.kept, 0);
});
test('strict half-open window includes start, excludes end; scope confusion fails closed', () => {
  assert.equal(projectManifest(scope, [{ ...source(), receivedAt: scope.start }]).counts.kept, 1);
  assert.equal(projectManifest(scope, [{ ...source(), receivedAt: scope.end }]).counts.kept, 0);
  assert.throws(() => projectManifest(scope, [{ ...source(), mailboxId: 'other' }]));
  assert.throws(() => projectManifest(scope, [{ ...source(), workspaceId: 'other' }]));
  assert.throws(() => projectManifest(scope, [{ ...source(), receivedAt: '2026-02-30T00:00:00.000Z' }]));
});
test('only verified authoritative delivery suppresses an identical source version', () => {
  assert.equal(projectManifest(scope, [source()], [previous()], true).counts.alreadyDelivered, 1);
  for (const status of ['drafted', 'scheduled', 'pending', 'uncertain', 'failed'])
    assert.equal(projectManifest(scope, [source()], [previous(status)], true).counts.kept, 1);
  assert.equal(projectManifest(scope, [source()], [{ ...previous(), authoritativeDelivery: false }], true).counts.kept, 1);
  assert.equal(projectManifest(scope, [source()], [previous()], false).counts.noveltyUnknown, 1);
});
test('revised delivered content remains an update; foreign prior manifests cannot suppress it', () => {
  const result = projectManifest(scope, [{ ...source(), digest: nextHash }], [previous()], true);
  assert.equal(result.counts.revisedSources, 1);
  assert.equal(result.counts.kept, 1);
  assert.throws(() => projectManifest(scope, [source()], [{ ...previous(), workspaceId: 'w2' }], true));
});
test('bounds and stable input ordering preserve exact source accounting', () => {
  const a = projectManifest(scope, [source('z'), source('a')]);
  const b = projectManifest(scope, [source('a'), source('z')]);
  assert.deepEqual(a, b);
  assert.throws(() => projectManifest(scope, Array(201).fill(source())));
  assert.throws(() => projectManifest({ ...scope, end: scope.start }, []));
  assert.throws(() => projectManifest(scope, Array.from({ length: 8 }, (_, i) => ({ ...source(String(i)), topics: [String(i)] }))));
});
const delivery = { kind: 'send', coordinationVerified: true, intentState: 'fresh',
  recipientConfirmed: true, audienceAccessConfirmed: true, currentPayloadHash: hash,
  reviewedPayloadHash: hash, operatorApproved: true };
test('read, recurrence and paid-report requests do not invoke storage, scheduling or wallet', () => {
  for (const [kind, state] of [['read', 'report_only'], ['recurring', 'scheduler_required'], ['paid_report', 'merchant_integration_required']]) {
    assert.deepEqual(planDelivery({ kind }), { state, authorizesEffect: false, walletAllowed: false });
  }
});
test('changed payload, missing audience/coordination or reserved/uncertain intent blocks writes', () => {
  for (const change of [{ currentPayloadHash: nextHash }, { coordinationVerified: false },
    { recipientConfirmed: false }, { audienceAccessConfirmed: false }, { intentState: 'reserved' },
    { intentState: 'uncertain' }, { intentState: 'sent' }, { intentState: undefined }])
    assert.equal(planDelivery({ ...delivery, ...change }).state, 'manual_reconciliation_required');
});
test('approval is additional to reservation readiness, not effect authorization', () => {
  assert.equal(planDelivery({ ...delivery, operatorApproved: false }).state, 'approval_required');
  const result = planDelivery(delivery);
  assert.equal(result.state, 'ready_for_owner_reservation');
  assert.equal(result.requiresActualAtomicReservation, true);
  assert.equal(result.authorizesEffect, false);
  assert.equal(planDelivery({ ...delivery, kind: 'draft', operatorApproved: false }).state, 'ready_for_owner_reservation');
});
test('one-time scheduling requires exact normalized future time and approval', () => {
  const request = { ...delivery, kind: 'schedule', now: scope.start, scheduledAt: scope.end };
  assert.equal(planDelivery(request).state, 'ready_for_owner_reservation');
  for (const scheduledAt of [scope.start, '2026-02-30T00:00:00.000Z', 'Monday morning', undefined])
    assert.equal(planDelivery({ ...request, scheduledAt }).state, 'invalid_one_time_schedule');
  assert.equal(planDelivery({ ...request, operatorApproved: false }).state, 'approval_required');
});
