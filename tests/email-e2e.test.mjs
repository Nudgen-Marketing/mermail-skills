import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { candidateMatches, normalizeMessage, runMessageChecks, redactUrl, usableLink } from '../skills/mermail-email-e2e/scripts/checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'skills/mermail-email-e2e/scripts/run-email-e2e.mjs');
const preload = path.join(root, 'tests/email-e2e-fetch-stub.mjs');
const fixture = { id: 'e', folder_id: 'inbox', recipient: 'qa@example.test', date: new Date().toISOString(), subject: 'Verify' };
const scope = { address: 'qa@example.test', expect: { subject: 'Verify' }, windowStart: new Date(Date.now() - 60000).toISOString(), windowEnd: Date.now() + 1000, folder: 'inbox' };

test('selection requires exact native envelope and window, never supplied defaults', () => {
  assert.equal(candidateMatches(fixture, scope), true);
  for (const patch of [{ folder_id: undefined }, { recipient: undefined }, { date: undefined }, { date: 'invalid' }, { folder_id: 'not-inbox' }, { recipient: 'foreign@example.test' }]) {
    assert.equal(candidateMatches({ ...fixture, ...patch }, scope), false);
  }
});

test('blocked content is not read, normalized or parsed', () => {
  for (const patch of [{ scan_status: 'flagged' }, { scan_status: null }, { content_omitted: true }, { content_truncated: true }, { body_storage_status: 'deleted' }]) {
    const source = { ...fixture, scan_status: 'clean', ...patch };
    for (const key of ['body', 'html', 'text', 'raw_headers']) Object.defineProperty(source, key, { get() { throw Error('blocked content read'); } });
    const checks = runMessageChecks(normalizeMessage(source));
    assert.ok(checks.some((x) => x.status === 'fail'));
    assert.ok(checks.every((x) => !x.cta && !x.otp));
  }
});

test('multipart wrapper alone cannot satisfy required plain-text part', () => {
  for (const kind of ['mixed', 'related', 'alternative']) {
    const normalized = normalizeMessage({ scan_status: 'clean', body: '<p>Hello</p>', body_format: 'html', raw_headers: { 'content-type': `multipart/${kind}` } });
    assert.equal(runMessageChecks(normalized, { requireText: true }).find((x) => x.id === 'CNT-004').status, 'fail');
  }
});

test('URLs redact short secrets, credentials, path and fragment; unsupported links rejected', () => {
  const safe = redactUrl('https://user:pw@app.example.test/xy?t=a#code');
  for (const secret of ['user', 'pw', '/xy', '?t=', '#code']) assert.ok(!safe.includes(secret));
  assert.equal(redactUrl('not-a-url/secret'), '[redacted URL]');
  for (const url of ['https://u:p@app.example.test/verify', 'http://app.example.test/verify', 'https://app.example.test/payment', 'javascript:alert(1)']) {
    assert.equal(usableLink(new URL(url), { mode: 'staging', linkHosts: ['app.example.test'] }), false);
  }
});

function run(scenario) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mermail-email-e2e-offline-'));
  try {
    const callsFile = path.join(dir, 'calls.json');
    const spec = { mailbox: 'box', rateLimitRpm: 1000, mode: 'dev', linkHosts: ['app.example.test'], reportDir: path.join(dir, 'report'), defaults: { checkDuplicates: false, timeoutSec: 2 },
      flows: [{ id: 'verification', trigger: { http: { url: 'https://app.example.test/trigger' } }, expect: { subject: 'Verify account', link: { pattern: '/verify/', follow: true }, otp: { pattern: '/\\b\\d{6}\\b/' } }, then: [{ http: { url: 'https://app.example.test/confirm', method: 'POST', json: { code: '{otp}' } }, expectJson: { ok: true } }] }] };
    if (scenario.startsWith('sent')) spec.capture = 'sent';
    const specFile = path.join(dir, 'spec.json');
    writeFileSync(specFile, JSON.stringify(spec));
    const result = spawnSync(process.execPath, ['--import', preload, script, '--spec', specFile], { encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, MERMAIL_API_KEY: ['sk', 'proj', 'offline-fixture'].join('-'), MERMAIL_MCP_URL: 'https://fixture.invalid/mcp', E2E_FIXTURE_CASE: scenario, E2E_FIXTURE_CALLS: callsFile } });
    assert.ifError(result.error);
    const calls = existsSync(callsFile) ? JSON.parse(readFileSync(callsFile, 'utf8')) : [];
    const report = existsSync(path.join(spec.reportDir, 'report.json')) ? readFileSync(path.join(spec.reportDir, 'report.json'), 'utf8') : '';
    return { ...result, calls, report };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const scenario of ['flagged', 'unknown', 'omitted', 'truncated', 'deleted', 'foreign', 'duplicate', 'mismatch', 'two-codes', 'page-two-duplicate', 'sent-accepted', 'sent-conflict']) {
  test(`actual runner: ${scenario} stops before CTA or post-condition`, () => {
    const result = run(scenario);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(!result.calls.some((x) => x.url.includes('/verify/') || x.url.endsWith('/confirm')));
    if (scenario === 'duplicate') assert.ok(!result.calls.some((x) => x.tool === 'get_email'));
  });
}
test('actual runner: a partial baseline blocks before triggering the app', () => {
  const result = run('baseline-partial');
  assert.equal(result.status, 2);
  assert.ok(!result.calls.some((x) => x.url.endsWith('/trigger')));
});
for (const scenario of ['page-two-foreign', 'sent-clean']) test(`actual runner: ${scenario} preserves the valid complete workflow`, () => {
  const result = run(scenario);
  assert.equal(result.status, 0, result.stderr + result.report);
  assert.equal(result.calls.filter((x) => x.url.includes('/verify/')).length, 1);
  if (scenario === 'page-two-foreign') assert.equal(result.calls.filter((x) => x.tool === 'search_emails').length, 2);
});
test('actual runner: clean exact selection consumes CTA once, then completes; reports fully redact OTP and URL', () => {
  const result = run('clean');
  assert.equal(result.status, 0, result.stderr + result.stdout + result.report);
  assert.equal(result.calls.filter((x) => x.url.includes('/verify/')).length, 1);
  assert.equal(result.calls.filter((x) => x.url.endsWith('/confirm')).length, 1);
  for (const output of [result.stdout, result.stderr, result.report]) for (const secret of ['782341', '/verify/xy', 'token=ab', '#secret']) assert.ok(!output.includes(secret));
});
test('actual runner: failed CTA never runs post-condition or exposes response body', () => {
  const result = run('follow-failed');
  assert.equal(result.status, 1);
  assert.ok(!result.calls.some((x) => x.url.endsWith('/confirm')));
  assert.ok(!result.report.includes('private-code'));
});
for (const scenario of ['429', '429-deadline']) test(`actual runner: ${scenario} ends within fixed retry/deadline budget`, () => {
  const result = run(scenario);
  assert.equal(result.status, 2);
  assert.equal(result.calls.length, scenario === '429' ? 5 : 1);
  assert.ok(!result.calls.some((x) => x.url.endsWith('/trigger')));
});
