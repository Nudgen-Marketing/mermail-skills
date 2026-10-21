'use strict';
// Actual synthetic local CLI regressions. No Mermail/tool/model/provider calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const helper = path.resolve(__dirname, '../skills/mermail-commitment-keeper/scripts/commitments.js');
const scratch = fs.mkdtempSync('/private/tmp/mermail-195-cli-');
let sequence = 0;
function file() { return path.join(scratch, `ledger-${++sequence}.json`); }
function cli(ledger, command, args = [], mailbox = 'mailbox-A') {
  const result = spawnSync(process.execPath, [helper, command, '--file', ledger,
    ...(mailbox === null ? [] : ['--mailbox-id', mailbox]), ...args], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}
function add(ledger, changes = [], mailbox = 'mailbox-A') {
  return cli(ledger, 'add', ['--creditor', 'owner@example.test', '--debtor', 'supplier@example.test',
    '--promise', 'Deliver signed contract', '--due', '2026-09-01', '--evidence-email-id', 'source-1',
    '--key', 'source-key-1', '--today', '2026-09-01', ...changes], mailbox);
}
function ok(result) { assert.equal(result.status, 0, result.stderr); return result.value; }
function refused(result, code) { assert.notEqual(result.status, 0); assert.equal(result.value.error, code); assert.equal(result.stdout, ''); }
function record(ledger, id, index, date) {
  return cli(ledger, 'followup', ['--id', id, '--key', `send-key-${index}`, '--message-id', `confirmed-message-${index}`,
    '--date', date, '--today', date]);
}

test('mailbox-scoped add keys bind exact immutable payload and never return another mailbox entry', () => {
  const ledger = file();
  const first = ok(add(ledger)).commitment;
  const repeat = ok(add(ledger));
  assert.equal(repeat.created, false);
  assert.equal(repeat.commitment.id, first.id);
  const second = ok(add(ledger, [], 'mailbox-B')).commitment;
  assert.notEqual(first.id, second.id);
  assert.equal(second.mailboxId, 'mailbox-B');
  for (const [flag, value] of [['--promise', 'Different private promise'], ['--creditor', 'other@example.test'],
    ['--debtor', 'other@example.test'], ['--due', '2026-09-02'], ['--evidence-email-id', 'different-source']]) {
    const args = ['--creditor', 'owner@example.test', '--debtor', 'supplier@example.test', '--promise', 'Deliver signed contract',
      '--due', '2026-09-01', '--evidence-email-id', 'source-1', '--key', 'source-key-1', '--today', '2026-09-01'];
    args[args.indexOf(flag) + 1] = value;
    refused(cli(ledger, 'add', args), 'idempotency_conflict');
  }
  assert.equal(ok(cli(ledger, 'list')).count, 1);
  assert.equal(ok(cli(ledger, 'list', [], 'mailbox-B')).count, 1);
});

test('all reads/writes require selected mailbox and foreign IDs disclose no entry data', () => {
  const ledger = file(), entry = ok(add(ledger)).commitment;
  for (const command of ['list', 'due', 'preflight', 'followup', 'complete', 'close']) {
    refused(cli(ledger, command, ['--id', entry.id], null), 'usage');
  }
  for (const command of ['preflight', 'followup', 'complete', 'close']) {
    const result = cli(ledger, command, ['--id', entry.id], 'mailbox-B');
    refused(result, 'not_found_or_out_of_scope');
    assert.doesNotMatch(result.stderr, /Deliver signed contract|supplier@example|mailbox-A/);
  }
});

test('due and preflight share current-date eligibility, caps and minimum gaps', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id;
  let due = ok(cli(ledger, 'due', ['--on', '2026-10-01', '--today', '2026-08-31']));
  assert.equal(due.commitments[0].dueClass, 'upcoming');
  assert.equal(due.commitments[0].followupEligible, false);
  assert.equal(due.commitments[0].followupReason, 'not_due');
  for (const [index, date] of [[1, '2026-09-01'], [2, '2026-09-04'], [3, '2026-09-07']]) {
    const preflight = ok(cli(ledger, 'preflight', ['--id', id, '--today', date]));
    assert.equal(preflight.commitment.followupEligible, true);
    assert.equal(preflight.commitment.atomicReservation, false);
    const recorded = ok(record(ledger, id, index, date));
    assert.equal(recorded.commitment.followUpCount, index);
    assert.equal(recorded.commitment.eligibleForAnother, false); // min gap, even below cap
    const sameDay = ok(cli(ledger, 'due', ['--today', date]));
    assert.equal(sameDay.commitments[0].followupEligible, false);
  }
  due = ok(cli(ledger, 'due', ['--today', '2026-09-10']));
  assert.equal(due.commitments[0].followUpCount, 3);
  assert.equal(due.commitments[0].followupReason, 'followup_frequency_cap');
  refused(record(ledger, id, 4, '2026-09-10'), 'followup_frequency_cap');
});

test('read-only preflight does not reserve cap or record uncertain delivery', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id, before = fs.readFileSync(ledger, 'utf8');
  for (let i = 0; i < 2; i++) {
    const snapshot = ok(cli(ledger, 'preflight', ['--id', id, '--today', '2026-09-01']));
    assert.equal(snapshot.commitment.followupEligible, true);
    assert.equal(snapshot.commitment.preflightOnly, true);
    assert.equal(snapshot.commitment.atomicReservation, false);
  }
  assert.equal(fs.readFileSync(ledger, 'utf8'), before);
  // Timeout/ambiguous external result has no authoritative message id: no
  // bookkeeping action and no retry is modeled or claimed by this CLI.
  refused(cli(ledger, 'followup', ['--id', id, '--key', 'uncertain', '--today', '2026-09-01']), 'usage');
  assert.equal(fs.readFileSync(ledger, 'utf8'), before);
});

test('confirmed followup bookkeeping is idempotent and binds key, message and record payload', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id;
  ok(record(ledger, id, 1, '2026-09-01'));
  const before = fs.readFileSync(ledger, 'utf8');
  assert.equal(ok(record(ledger, id, 1, '2026-09-01')).recorded, false);
  assert.equal(fs.readFileSync(ledger, 'utf8'), before);
  refused(cli(ledger, 'followup', ['--id', id, '--key', 'send-key-1', '--message-id', 'changed-message',
    '--today', '2026-09-04']), 'idempotency_conflict');
  refused(cli(ledger, 'followup', ['--id', id, '--key', 'different-key', '--message-id', 'confirmed-message-1',
    '--today', '2026-09-04']), 'idempotency_conflict');
  assert.equal(fs.readFileSync(ledger, 'utf8'), before);
});

test('cannot follow up before due, backdate, future-date or bypass policy with malformed numbers', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id;
  refused(record(ledger, id, 1, '2026-08-31'), 'not_due');
  for (const date of ['2026-08-31', '2026-09-02']) refused(cli(ledger, 'followup',
    ['--id', id, '--key', 'send-k', '--message-id', 'sent-1', '--date', date, '--today', '2026-09-01']), 'followup_date_mismatch');
  for (const number of ['Infinity', '1e2', '-1', '1.1', '10001']) refused(cli(ledger, 'preflight',
    ['--id', id, '--today', '2026-09-01', '--max-count', number]), 'usage');
  refused(cli(ledger, 'list', ['--today', '2026-02-30']), 'usage');
  refused(cli(ledger, 'due', ['--on', '2026-02-30']), 'usage');
});

test('missing/corrupt/ambiguous ledger and malformed arguments fail with safe diagnostics', () => {
  const ledger = file();
  refused(cli(ledger, 'list'), 'ledger_missing');
  fs.writeFileSync(ledger, '{PRIVATE_BODY_MARKER');
  const corrupt = cli(ledger, 'list');
  refused(corrupt, 'ledger_corrupt');
  assert.doesNotMatch(corrupt.stderr, /PRIVATE_BODY_MARKER/);
  fs.writeFileSync(ledger, JSON.stringify({ version: 1, commitments: [{ id: 'bad' }] }));
  refused(cli(ledger, 'due'), 'ledger_corrupt');
  refused(cli(ledger, 'list', ['--mailbox-id', 'duplicate']), 'usage');
  refused(cli(ledger, 'list', ['--unknown', 'PRIVATE_BODY_MARKER']), 'usage');
  const valid = file(); ok(add(valid));
  const data = JSON.parse(fs.readFileSync(valid)); data.commitments.push(data.commitments[0]);
  fs.writeFileSync(valid, JSON.stringify(data));
  refused(cli(valid, 'list'), 'ledger_corrupt');
});

test('fulfillment and close preserve immutable add binding; legacy unverifiable replay is held', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id;
  refused(cli(ledger, 'close', ['--id', id, '--reason', 'fulfilled']), 'evidence_required');
  ok(cli(ledger, 'complete', ['--id', id, '--evidence-email-id', 'fulfilled-evidence', '--today', '2026-09-03']));
  assert.equal(ok(add(ledger)).created, false);
  assert.equal(ok(cli(ledger, 'preflight', ['--id', id])).commitment.followupReason, 'not_open');
  ok(cli(ledger, 'close', ['--id', id, '--reason', 'fulfilled', '--today', '2026-09-03']));
  const data = JSON.parse(fs.readFileSync(ledger)); delete data.commitments[0].addPayloadHash;
  fs.writeFileSync(ledger, JSON.stringify(data));
  refused(add(ledger), 'idempotency_unverified');
});

test('corrupt or duplicate followup bindings stop reads; legacy history is not invented into verified keys', () => {
  const ledger = file(), id = ok(add(ledger)).commitment.id;
  ok(record(ledger, id, 1, '2026-09-01'));
  const original = JSON.parse(fs.readFileSync(ledger));
  const changed = structuredClone(original);
  changed.commitments[0].followUps[0].messageId = 'changed-receipt';
  fs.writeFileSync(ledger, JSON.stringify(changed));
  refused(cli(ledger, 'list'), 'ledger_corrupt');
  const duplicate = structuredClone(original);
  duplicate.commitments[0].followUps.push(duplicate.commitments[0].followUps[0]);
  fs.writeFileSync(ledger, JSON.stringify(duplicate));
  refused(cli(ledger, 'due'), 'ledger_corrupt');
  const legacy = structuredClone(original);
  legacy.commitments[0].followUps = [{ date: '2026-09-01', draftId: 'legacy-draft', note: 'old history only' }];
  fs.writeFileSync(ledger, JSON.stringify(legacy));
  const read = ok(cli(ledger, 'preflight', ['--id', id, '--today', '2026-09-04']));
  assert.equal(read.commitment.followUpCount, 1);
  assert.equal(read.commitment.atomicReservation, false);
  assert.equal(fs.readFileSync(ledger, 'utf8'), JSON.stringify(legacy));
});
