import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLedger, renderLedger, deadlineStatus, writeReport } from '../skills/mermail-promise-ledger/scripts/report.mjs';
const fixture = JSON.parse(await readFile(new URL('../skills/mermail-promise-ledger/assets/demo-ledger.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);

test('unsent automatic drafts are rejected as agreement evidence', () => {
  const d = copy(); d.messages[0].folder = 'draft';
  assert.throws(() => validateLedger(d), /unsent messages/);
});

test('original fixture yields overdue accepted QA, unresolved extension and unknown EOD', () => {
  const d = validateLedger(copy());
  assert.equal(deadlineStatus(d.commitments[2], d), 'Overdue as of review');
  assert.equal(deadlineStatus(d.commitments[3], d), 'Unresolved');
  assert.equal(deadlineStatus(d.commitments[5], d), 'Date/time needs clarification');
  assert.equal(d.commitments[3].supersedes, null);
});
test('invented quotes and source references are rejected', () => {
  const d = copy(); d.commitments[0].evidence[0].quote = 'Monday extension is approved';
  assert.throws(() => validateLedger(d), /quote not found/);
  const e = copy(); e.issues[0].evidence[0].messageId = 'invented';
  assert.throws(() => validateLedger(e), /unknown message/);
});
test('accepted revisions require an accepted successor with evidence', () => {
  const d = copy(); const previous = d.commitments[2], next = d.commitments[3];
  previous.state = 'superseded'; next.supersedes = previous.id;
  assert.throws(() => validateLedger(d), /accepted successor|accepted revision/);
  next.state = 'accepted'; next.acceptanceEvidence = [];
  assert.throws(() => validateLedger(d), /at least one source/);
  d.messages.push({ ...d.messages[0], id: 'acceptance', text: 'I accept the revised QA deadline at 14:00.' });
  next.acceptanceEvidence = [{ messageId: 'acceptance', quote: 'I accept the revised QA deadline at 14:00.' }];
  assert.equal(validateLedger(d).commitments[2].state, 'superseded');
  assert.equal(deadlineStatus(previous, d), 'Replaced');
});
test('multi-step revision history retains replaced accepted revisions', () => {
  const d = copy(); const first = d.commitments[2], second = d.commitments[3];
  first.state = 'superseded'; second.state = 'superseded'; second.supersedes = first.id;
  second.acceptanceEvidence = first.acceptanceEvidence;
  const third = { ...structuredClone(second), id: 'C7', state: 'accepted', supersedes: second.id };
  d.commitments.push(third);
  assert.doesNotThrow(() => validateLedger(d));
  const self = copy(); self.commitments[0].supersedes = self.commitments[0].id;
  assert.throws(() => validateLedger(self), /invalid supersedes/);
});
test('missing owner and deadline stay explicit; nonaccepted promises are not overdue', () => {
  const d = copy(); d.commitments[0].owner = null; d.commitments[0].state = 'promised'; d.asOf = '2026-10-20T12:00:00Z';
  assert.equal(deadlineStatus(validateLedger(d).commitments[0], d), 'Deadline stated; acceptance unconfirmed');
  assert.match(renderLedger(d).html, /Unknown/);
});
test('timestamps need offsets and ambiguous deadlines cannot be fabricated by omission', () => {
  const d = copy(); d.commitments[0].dueAt = '2026-10-09T17:00:00';
  assert.throws(() => validateLedger(d), /requires an ISO timestamp/);
  const e = copy(); e.commitments[4].dueAt = '2026-10-09T17:00:00Z';
  assert.throws(() => validateLedger(e), /needs source wording/);
});

test('impossible local dates/times cannot become as-of, message or deadline evidence', () => {
  for (const date of ['2026-02-30T17:00:00+01:00', '2026-02-29T00:00:00Z', '2026-04-31T12:00:00Z',
    '2026-10-09T24:00:00Z', '2026-10-09T12:60:00Z', '2026-10-09T12:00:60Z',
    '2026-10-09T12:00:00+14:01', '2026-10-09T12:00:00+01:60', '2026-10-09T12:00:00.0001Z']) {
    for (const field of ['asOf', 'message', 'due']) {
      const d = copy();
      if (field === 'asOf') d.asOf = date;
      else if (field === 'message') d.messages[0].date = date;
      else d.commitments[0].dueAt = date;
      assert.throws(() => validateLedger(d), /ISO timestamp|invalid message date/, `${field}: ${date}`);
    }
  }
});

test('real leap days and equivalent offset instants remain valid without string ordering', () => {
  const d = copy(); d.asOf = '2028-02-29T12:00:00+05:30';
  d.messages[0].date = '2028-02-29T00:00:00.001Z';
  d.commitments[0].dueAt = '2028-02-29T06:30:00Z';
  assert.doesNotThrow(() => validateLedger(d));
  assert.equal(deadlineStatus(d.commitments[0], d), 'Upcoming as of review');
  d.commitments[0].dueAt = '2028-02-29T06:29:59.999Z';
  assert.equal(deadlineStatus(validateLedger(d).commitments[0], d), 'Overdue as of review');
});
test('partial coverage is visible and fixture output never claims live proof', () => {
  const d = copy(); d.coverage = { status: 'partial', detail: 'A cursor remains; earlier history is unavailable.' };
  const r = renderLedger(d);
  assert.match(r.html, /Coverage: partial/); assert.match(r.markdown, /cursor remains/);
  assert.match(r.html, /SYNTHETIC LOCAL DEMO/);
});
test('duplicate source IDs, excessive bodies and absent acceptance fail closed', () => {
  const d = copy(); d.messages.push(d.messages[0]); assert.throws(() => validateLedger(d), /duplicate message/);
  const e = copy(); e.messages[0].text = 'x'.repeat(12001); assert.throws(() => validateLedger(e), /max 12000/);
  const f = copy(); f.commitments[0].acceptanceEvidence = []; assert.throws(() => validateLedger(f), /at least one source/);
});
test('malicious HTML and Markdown links are displayed as inert text', () => {
  const d = copy(); const attack = '<script>alert(1)</script><img src="https://evil.example/pixel"> [click](https://evil.example)';
  d.messages[4].text += attack; d.title = '<svg onload=alert(1)>'; d.clarificationDraft = attack;
  const r = renderLedger(d);
  assert.doesNotMatch(r.html, /<script>|<img |<svg /);
  assert.match(r.html, /&lt;script&gt;/); assert.match(r.html, /default-src 'none'/);
  assert.match(r.markdown, /\\\[click\\\]/);
  assert.doesNotMatch(r.html, /href="https:\/\/evil/);
});
test('CLI helper writes both reports only after validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'promise-ledger-'));
  try {
    const result = await writeReport(new URL('../skills/mermail-promise-ledger/assets/demo-ledger.json', import.meta.url), dir);
    assert.equal(result.messages, 5); await access(join(dir, 'ledger.html')); await access(join(dir, 'ledger.md'));
    assert.match(await readFile(join(dir, 'ledger.html'), 'utf8'), /Unsent/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid source instant is rejected before existing report files can change', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'promise-ledger-invalid-'));
  try {
    const d = copy(); d.messages[0].date = '2026-02-30T00:00:00Z';
    const input = join(dir, 'input.json'); await writeFile(input, JSON.stringify(d));
    await writeFile(join(dir, 'ledger.html'), 'SYNTHETIC_HTML_SENTINEL');
    await writeFile(join(dir, 'ledger.md'), 'SYNTHETIC_MD_SENTINEL');
    await assert.rejects(writeReport(input, dir), /invalid message date/);
    assert.equal(await readFile(join(dir, 'ledger.html'), 'utf8'), 'SYNTHETIC_HTML_SENTINEL');
    assert.equal(await readFile(join(dir, 'ledger.md'), 'utf8'), 'SYNTHETIC_MD_SENTINEL');
    const absent = join(dir, 'new-output');
    await assert.rejects(writeReport(input, absent), /invalid message date/);
    await assert.rejects(access(absent));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
