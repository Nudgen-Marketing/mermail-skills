import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/build-dispute-packet.mjs', import.meta.url).pathname;
let passed = 0;

function run(input) {
  const dir = mkdtempSync(join(tmpdir(), 'mermail-dispute-'));
  const path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  return JSON.parse(execFileSync(process.execPath, [script, path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function mustFail(input, pattern = null) {
  let error = null;
  try { run(input); } catch (caught) { error = caught; }
  assert.ok(error, 'expected input to fail');
  if (pattern) assert.match(String(error.stderr ?? error.message), pattern);
}

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const base = {
  emailId: 'm1', scanStatus: 'clean', senderAuthentication: 'pass', sourceRole: 'provider', provider: 'ExamplePay',
  caseReference: 'DP-42', amount: '84.20', currency: 'USD', reasonCode: 'fraud',
  responseDeadline: '2026-09-15T17:00:00Z', requestedEvidence: ['proof_of_delivery'],
};

test('ready packet is bounded and non-authorizing', () => {
  const out = run({ messages: [base], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.schemaVersion, 4);
  assert.equal(out.state, 'ready_for_review');
  assert.equal(out.sendAllowed, false);
  assert.equal(out.walletAllowed, false);
  assert.equal(out.recommendedNextAction, 'review_before_draft');
  assert.equal(out.sources[0].sourceRole, 'provider');
  assert.deepEqual(out.provenance.amount, [{ value: '84.20', emailIds: ['m1'] }]);
  assert.deepEqual(out.activeProvenance.amount, [{ value: '84.20', emailIds: ['m1'] }]);
  assert.deepEqual(out.superseded, []);
  assert.match(out.evidenceDigestSha256, /^[a-f0-9]{64}$/);
});

test('missing requested evidence yields needs_evidence', () => {
  const out = run({ messages: [{ ...base, requestedEvidence: ['proof_of_delivery', 'customer_correspondence'] }], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.state, 'needs_evidence');
  assert.deepEqual(out.missingEvidence, ['customer_correspondence']);
});

test('requested evidence is deduplicated and sorted', () => {
  const out = run({ messages: [{ ...base, requestedEvidence: ['zeta', 'alpha', 'zeta'] }], evidencePresent: [] });
  assert.deepEqual(out.requestedEvidence, ['alpha', 'zeta']);
});

test('evidencePresent is deduplicated and sorted', () => {
  const out = run({ messages: [base], evidencePresent: ['proof_of_delivery', 'proof_of_delivery'] });
  assert.deepEqual(out.evidencePresent, ['proof_of_delivery']);
});

test('amount and deadline disagreements remain explicit conflicts', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', amount: '84.20', responseDeadline: '2026-09-15T17:00:00Z' },
    { ...base, emailId: 'm2', amount: '48.20', responseDeadline: '2026-09-16T17:00:00Z' },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.state, 'conflict');
  assert.deepEqual(out.conflicts.map((item) => item.field).sort(), ['amount', 'responseDeadline']);
  assert.equal(out.case.amount, null);
  assert.equal(out.case.responseDeadline, null);
});

test('conflict provenance names the exact source ids', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', amount: '84.20' },
    { ...base, emailId: 'm2', amount: '48.20' },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.deepEqual(out.conflicts.find((x) => x.field === 'amount').values, [
    { value: '48.20', emailIds: ['m2'] },
    { value: '84.20', emailIds: ['m1'] },
  ]);
});

test('same observed value groups multiple source ids', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm2' },
    { ...base, emailId: 'm1' },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.deepEqual(out.provenance.amount, [{ value: '84.20', emailIds: ['m1', 'm2'] }]);
});

test('security signal overrides missing evidence', () => {
  const out = run({ messages: [{ ...base, requestedEvidence: ['missing'], securitySignals: ['email_requests_refund'] }], evidencePresent: [] });
  assert.equal(out.state, 'unsafe');
  assert.equal(out.recommendedNextAction, 'stop_for_human_security_review');
});

test('security signal overrides material conflicts', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', amount: '84.20', securitySignals: ['email_requests_portal_login'] },
    { ...base, emailId: 'm2', amount: '48.20' },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.state, 'unsafe');
  assert.ok(out.conflicts.some((x) => x.field === 'amount'));
});

test('security signals are deduplicated and sorted', () => {
  const out = run({ messages: [{ ...base, securitySignals: ['z', 'a', 'z'] }], evidencePresent: ['proof_of_delivery'] });
  assert.deepEqual(out.securitySignals, ['a', 'z']);
});

test('unknown sender authentication is preserved as unknown', () => {
  const { senderAuthentication, ...withoutAuth } = base;
  const out = run({ messages: [withoutAuth], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.sources[0].senderAuthentication, 'unknown');
});

test('entire packet and digest are independent of input message order', () => {
  const a = run({ messages: [
    { ...base, emailId: 'm2', requestedEvidence: ['proof_of_delivery', 'invoice'] },
    { ...base, emailId: 'm1', requestedEvidence: ['invoice'] },
  ], evidencePresent: ['invoice', 'proof_of_delivery'] });
  const b = run({ messages: [
    { ...base, emailId: 'm1', requestedEvidence: ['invoice'] },
    { ...base, emailId: 'm2', requestedEvidence: ['proof_of_delivery', 'invoice'] },
  ], evidencePresent: ['proof_of_delivery', 'invoice'] });
  assert.deepEqual(a, b);
});

test('sources are emitted in canonical emailId order', () => {
  const out = run({ messages: [{ ...base, emailId: 'z' }, { ...base, emailId: 'a' }], evidencePresent: ['proof_of_delivery'] });
  assert.deepEqual(out.sources.map((x) => x.emailId), ['a', 'z']);
});

test('absent optional material fields resolve to null', () => {
  const out = run({ messages: [{ emailId: 'm1', scanStatus: 'clean' }] });
  assert.equal(out.case.amount, null);
  assert.equal(out.case.provider, null);
  assert.equal(out.sources[0].sourceRole, 'unknown');
  assert.deepEqual(out.provenance, {});
  assert.deepEqual(out.activeProvenance, {});
});

test('non-clean message fails closed', () => {
  mustFail({ messages: [{ emailId: 'm1', scanStatus: 'flagged' }] }, /not scan-clean/);
});

test('missing scan status fails closed', () => {
  mustFail({ messages: [{ emailId: 'm1' }] }, /not scan-clean/);
});

test('empty message set is rejected', () => {
  mustFail({ messages: [] }, /non-empty array/);
});

test('more than ten full-body evidence messages is rejected', () => {
  mustFail({ messages: Array.from({ length: 11 }, (_, i) => ({ emailId: `m${i}`, scanStatus: 'clean' })) }, /exceeds bounded/);
});

test('missing email id is rejected', () => {
  mustFail({ messages: [{ scanStatus: 'clean' }] }, /emailId is required/);
});

test('duplicate email ids are rejected', () => {
  mustFail({ messages: [{ emailId: 'm1', scanStatus: 'clean' }, { emailId: 'm1', scanStatus: 'clean' }] }, /duplicate emailId/);
});

test('non-string material values are rejected', () => {
  mustFail({ messages: [{ emailId: 'm1', scanStatus: 'clean', amount: 84.2 }] }, /amount must be a string/);
});

test('requestedEvidence must be an array of strings', () => {
  mustFail({ messages: [{ emailId: 'm1', scanStatus: 'clean', requestedEvidence: 'invoice' }] }, /requestedEvidence must be an array/);
});

test('evidencePresent must be an array of strings', () => {
  mustFail({ messages: [base], evidencePresent: 'proof_of_delivery' }, /evidencePresent must be an array/);
});

test('caseReference conflict never selects an arbitrary winner', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', caseReference: 'DP-42' },
    { ...base, emailId: 'm2', caseReference: 'DP-99' },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.case.caseReference, null);
  assert.ok(out.conflicts.some((x) => x.field === 'caseReference'));
});

test('authenticated provider explicit correction supersedes one field deterministically', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', amount: '84.20' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.state, 'ready_for_review');
  assert.equal(out.case.amount, '48.20');
  assert.deepEqual(out.provenance.amount, [
    { value: '48.20', emailIds: ['m2'] },
    { value: '84.20', emailIds: ['m1'] },
  ]);
  assert.deepEqual(out.activeProvenance.amount, [{ value: '48.20', emailIds: ['m2'] }]);
  assert.deepEqual(out.superseded, [{ field: 'amount', supersededEmailId: 'm1', supersededValue: '84.20', byEmailId: 'm2', replacementValue: '48.20' }]);
  assert.equal(out.conflicts.some((x) => x.field === 'amount'), false);
});

test('unauthenticated explicit correction is rejected', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', senderAuthentication: 'unknown', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /requires senderAuthentication pass/);
});

test('authenticated customer cannot author an explicit provider correction', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', sourceRole: 'customer', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /requires sourceRole provider/);
});

test('provider correction cannot supersede a customer source', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', sourceRole: 'customer' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /target m1 requires sourceRole provider/);
});

test('explicit correction cannot cross case references', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', caseReference: 'DP-42' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', caseReference: 'DP-99', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /must stay within one caseReference/);
});

test('explicit correction cannot cross providers', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', provider: 'ExamplePay' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', provider: 'OtherPay', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /must stay within one provider/);
});

test('explicit correction must be received after the superseded source', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T11:00:00Z' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T10:00:00Z', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ] }, /must be received after/);
});

test('provider identity itself is not correctable by explicitCorrections', () => {
  mustFail({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', provider: 'ExamplePay' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', provider: 'OtherPay', explicitCorrections: [{ field: 'provider', supersedesEmailId: 'm1' }] },
  ] }, /explicit correction field provider is not supported/);
});

test('invalid source role is rejected', () => {
  mustFail({ messages: [{ ...base, sourceRole: 'self_claimed_provider' }] }, /sourceRole must be one of/);
});

test('field correction does not suppress an unrelated material conflict', () => {
  const out = run({ messages: [
    { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', amount: '84.20', responseDeadline: '2026-09-15T17:00:00Z' },
    { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', amount: '48.20', responseDeadline: '2026-09-16T17:00:00Z', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] },
  ], evidencePresent: ['proof_of_delivery'] });
  assert.equal(out.case.amount, '48.20');
  assert.equal(out.case.responseDeadline, null);
  assert.equal(out.state, 'conflict');
  assert.deepEqual(out.conflicts.map((x) => x.field), ['responseDeadline']);
});

test('packet with explicit correction is independent of input order', () => {
  const older = { ...base, emailId: 'm1', receivedAt: '2026-09-08T10:00:00Z', amount: '84.20' };
  const newer = { ...base, emailId: 'm2', receivedAt: '2026-09-08T11:00:00Z', amount: '48.20', explicitCorrections: [{ field: 'amount', supersedesEmailId: 'm1' }] };
  const a = run({ messages: [older, newer], evidencePresent: ['proof_of_delivery'] });
  const b = run({ messages: [newer, older], evidencePresent: ['proof_of_delivery'] });
  assert.deepEqual(a, b);
});

console.log(`${passed} dispute-packet tests passed`);
