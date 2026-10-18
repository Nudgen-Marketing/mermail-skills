import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReview } from '../skills/mermail-approval-gate/scripts/decision.mjs';

const gate = () => ({ workspaceId: 'w', mailboxId: 'm', approver: 'Owner@review.example',
  recipient: 'approvals@agency.example', threadId: 't', requestId: 'r', token: 'ABCD-EFGH-JKLM-NPQR',
  previewHash: 'frozen', currentPreviewHash: 'frozen', sentAt: '2026-10-18T00:00:00.000Z',
  expiresAt: '2026-10-19T00:00:00.000Z', intentState: 'pending', coverageComplete: true });
const message = () => ({ id: 'reply', workspaceId: 'w', mailboxId: 'm', threadId: 't', replyToId: 'r',
  from: 'Owner@review.example', to: 'approvals@agency.example', scan: 'clean', authentication: 'pass',
  authoredSeparated: true, receivedAt: '2026-10-18T00:01:00.000Z', authoredText: 'APPROVE ABCD-EFGH-JKLM-NPQR' });
const now = '2026-10-18T00:02:00.000Z';
const run = (messages = [message()], state = gate(), clock = now) => projectReview(state, messages, clock);

test('valid decision is review evidence, never effect authorization', () => {
  assert.deepEqual(run(), { state: 'review_approved', authorizesEffect: false });
});
test('whole identity preserves local part and full subdomain', () => {
  for (const from of ['owner@review.example', 'Owner@other.review.example', 'Owner@review.example.attacker.invalid', 'Owner+alias@review.example'])
    assert.equal(run([{ ...message(), from }]).state, 'pending');
  assert.equal(run([{ ...message(), from: 'Owner@REVIEW.EXAMPLE' }]).state, 'review_approved');
});
test('requires exact workspace mailbox request and thread', () => {
  for (const key of ['workspaceId', 'mailboxId', 'threadId', 'replyToId', 'to'])
    assert.equal(run([{ ...message(), [key]: 'other' }]).state, 'pending');
});
test('unknown auth scan and authored separation fail closed', () => {
  for (const patch of [{ authentication: 'unknown' }, { scan: 'skipped' }, { authoredSeparated: false }])
    assert.equal(run([{ ...message(), ...patch }]).state, 'blocked');
});
test('quoted/later/lowercase/substrings do not match leading directive', () => {
  for (const authoredText of ['> APPROVE ABCD-EFGH-JKLM-NPQR', 'Thanks\nAPPROVE ABCD-EFGH-JKLM-NPQR', 'approve ABCD-EFGH-JKLM-NPQR', 'APPROVE ABCD-EFGH-JKLM-NPQRX'])
    assert.equal(run([{ ...message(), authoredText }]).state, 'pending');
});
test('commentary cannot widen action; duplicate or conflicting decisions stop', () => {
  assert.equal(run([{ ...message(), authoredText: message().authoredText + '\nPlease change destination' }]).state, 'review_approved');
  assert.equal(run([message(), { ...message(), id: 'second' }]).state, 'ambiguous');
  assert.equal(run([message(), { ...message(), id: 'decline', authoredText: 'DECLINE ABCD-EFGH-JKLM-NPQR' }]).state, 'ambiguous');
  assert.equal(run([{ ...message(), authoredText: message().authoredText + '\nDECLINE ABCD-EFGH-JKLM-NPQR' }]).state, 'ambiguous');
});
test('identical observations deduplicate; changed same-ID observations block', () => {
  assert.equal(run([message(), message()]).state, 'review_approved');
  assert.equal(run([message(), { ...message(), authentication: 'fail' }]).state, 'blocked');
});
test('expiry future and invalid calendar timestamps fail closed', () => {
  assert.equal(run([message()], gate(), '2026-10-20T00:00:00.000Z').state, 'expired');
  for (const receivedAt of ['2026-10-18T00:03:00.000Z', gate().sentAt])
    assert.equal(run([{ ...message(), receivedAt }]).state, 'pending');
  assert.equal(run([{ ...message(), receivedAt: '2026-02-30T00:00:00.000Z' }]).state, 'blocked');
});
test('consumption uncertainty incomplete coverage or changed preview never approves', () => {
  for (const patch of [{ intentState: 'consumed' }, { intentState: 'reserved' }, { intentState: 'uncertain' },
    { intentState: 'rejected' }, { coverageComplete: false }, { currentPreviewHash: 'new' }])
    assert.equal(run([message()], { ...gate(), ...patch }).state, 'blocked');
});
test('sole decline rejects; aliases require frozen request policy', () => {
  assert.equal(run([{ ...message(), authoredText: 'DECLINE ABCD-EFGH-JKLM-NPQR' }]).state, 'rejected');
  const reject = { ...message(), authoredText: 'REJECT ABCD-EFGH-JKLM-NPQR' };
  assert.equal(run([reject]).state, 'pending');
  assert.equal(run([reject], { ...gate(), allowRejectAlias: true }).state, 'rejected');
});
test('bounds and controls cannot be normalized into approval', () => {
  assert.equal(run(Array.from({ length: 21 }, (_, i) => ({ ...message(), id: String(i) }))).state, 'blocked');
  for (const authoredText of ['\u202e' + message().authoredText, message().authoredText + 'x'.repeat(10000)])
    assert.equal(run([{ ...message(), authoredText }]).state, 'blocked');
});
