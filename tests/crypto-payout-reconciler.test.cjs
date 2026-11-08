'use strict';
// Actual offline CLI tests with synthetic owner lists/claims. No MCP effects.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const helper = path.resolve(__dirname, '../skills/mermail-crypto-payout-reconciler/scripts/reconcile.js');
const scratch = fs.mkdtempSync('/private/tmp/mermail-311-cli-');
const evm = '0x' + '12'.repeat(20);
const headers = 'claim_id,claimant_name,wallet_address,chain,amount,token';
const expected = (overrides = {}) => ({ claim_id: 'reward-001', claimant_name: 'Synthetic Owner List',
  wallet_address: evm, chain: 'evm', amount: '5.00', token: 'USDC', ...overrides });
const claim = (overrides = {}) => ({ ...expected(), sender_auth: 'pass', ...overrides });
function csv(rows) {
  return headers + '\n' + rows.map(row => headers.split(',').map(key =>
    '"' + String(row[key]).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
}
let counter = 0;
function run({ claims = [claim()], rows = [expected()], csvText, jsonText, extra = [], priorOutput } = {}) {
  const directory = path.join(scratch, String(++counter));
  fs.mkdirSync(directory);
  const claimsPath = path.join(directory, 'claims.json');
  const expectedPath = path.join(directory, 'expected.csv');
  const outputPath = path.join(directory, 'report.json');
  fs.writeFileSync(claimsPath, jsonText === undefined ? JSON.stringify(claims) : jsonText);
  fs.writeFileSync(expectedPath, csvText === undefined ? csv(rows) : csvText);
  if (priorOutput !== undefined) fs.writeFileSync(outputPath, priorOutput);
  const result = spawnSync(process.execPath, [helper, '--claims', claimsPath, '--expected', expectedPath,
    '--out', outputPath, ...extra], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
  return { ...result, output, report: result.status === 0 ? JSON.parse(output) : null };
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.report.scope.auto_actions, 0);
  assert.equal(result.report.scope.durable_replay_backend, 'blocked_author_implementation');
  assert.equal(result.report.scope.replay_protection, 'in_run_only');
}
function rejected(result) {
  assert.equal(result.status, 2);
  assert.equal(result.output, null);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'error: invalid arguments/input, ambiguous expected list, or unavailable new output path; no report written\n');
}

test('ordinary EVM matching uses exact decimal value, preserves chain and has no actions', () => {
  const result = run({ claims: [claim({ amount: '5' })] });
  success(result);
  assert.equal(result.report.matched.length, 1);
  assert.deepEqual(result.report.matched[0], { claim_id: 'reward-001', wallet: evm, chain: 'evm', amount: '5', token: 'USDC' });
  assert.equal(result.report.scope.cap, '10000');
});

test('network/wallet/token/amount mismatches cannot match', () => {
  for (const changes of [{ chain: 'solana' }, { wallet_address: '0x' + '34'.repeat(20) },
    { token: 'USDG' }, { amount: '5.000000000000000001' }]) {
    const result = run({ claims: [claim(changes)] });
    success(result);
    assert.equal(result.report.matched.length, 0);
    assert.equal(result.report.amount_mismatch.length + result.report.invalid_wallet.length, 1);
    if (result.report.amount_mismatch.length) assert.equal(result.report.amount_mismatch[0].expected.chain, 'evm');
  }
});

test('non-positive, non-string, rounded and malformed amounts are held by actual CLI', () => {
  for (const amount of ['0', '-5', '+5', '5e0', '5.', '.5', '05', '5,000', 'NaN', 'Infinity',
    '5.0000000000000000001', '10000.000000000000000001', '10001', 5, null, {}, '5 '.repeat(50)]) {
    const result = run({ claims: [claim({ amount })] });
    success(result);
    assert.equal(result.report.matched.length, 0);
    assert.equal(result.report.invalid_claim.length, 1);
  }
});

test('exact small positive and cap boundary, explicit owner cap override', () => {
  for (const amount of ['0.000000000000000001', '10000.000000000000000000']) {
    const result = run({ claims: [claim({ amount })], rows: [expected({ amount })] });
    success(result);
    assert.equal(result.report.matched.length, 1);
  }
  const higher = run({ claims: [claim({ amount: '10001' })], rows: [expected({ amount: '10001' })], extra: ['--cap', '10001'] });
  success(higher);
  assert.equal(higher.report.matched.length, 1);
  assert.equal(higher.report.scope.cap, '10001');
  for (const cap of ['0', '-1', 'Infinity', '1e4', '1.0000000000000000001']) rejected(run({ extra: ['--cap', cap] }));
});

test('Solana decodes exactly 32 bytes, not a fixed 44 characters', () => {
  // All-zero and leading-zero byte sequences are format-valid; format does
  // not prove spendability/ownership. No balance/account calls are made.
  for (const wallet_address of ['1'.repeat(32), '1'.repeat(31) + '2', 'So11111111111111111111111111111111111111112',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']) {
    const fields = { wallet_address, chain: 'solana' };
    const result = run({ claims: [claim(fields)], rows: [expected(fields)] });
    success(result);
    assert.equal(result.report.matched.length, 1, wallet_address);
  }
  for (const wallet_address of ['1'.repeat(31), '1'.repeat(33), 'z'.repeat(44), '0'.repeat(44), '1'.repeat(45)]) {
    const result = run({ claims: [claim({ wallet_address, chain: 'solana' })] });
    success(result);
    assert.equal(result.report.invalid_wallet.length, 1, wallet_address);
  }
});

test('duplicate expected ids, including whitespace-normalized CSV ids, fail before any output', () => {
  rejected(run({ rows: [expected(), expected()] }));
  rejected(run({ rows: [expected(), expected({ claim_id: ' reward-001 ' })] }));
  rejected(run({ rows: [expected(), expected({ token: 'SOL' })] }));
});

test('invalid expected records fail rather than silently becoming trusted', () => {
  for (const changes of [{ amount: '-5' }, { amount: '0' }, { amount: '10001' }, { amount: '1e1' },
    { amount: 'NaN' }, { amount: '5.0000000000000000001' }, { token: 'UNKNOWN' }, { chain: 'ethereum' },
    { chain: 'solana' }, { wallet_address: 'not-wallet' }, { claim_id: '' }, { claim_id: 'ambiguous id' }]) rejected(run({ rows: [expected(changes)] }));
});

test('duplicate claims hold every occurrence, not just the second', () => {
  const result = run({ claims: [claim(), claim({ amount: '6' })] });
  success(result);
  assert.equal(result.report.matched.length, 0);
  assert.equal(result.report.duplicate_claim.length, 2);
});

test('sender, injection, unknown claimant and malformed claim fields stay held', () => {
  for (const [changes, category] of [[{ sender_auth: 'unknown' }, 'unverifiable_sender'],
    [{ flags: 'injection attempt' }, 'injection_attempt'], [{ claim_id: 'new-id' }, 'unknown_claimant'],
    [{ chain: 'ethereum' }, 'invalid_claim'], [{ token: 'USDT' }, 'invalid_claim'],
    [{ flags: {} }, 'invalid_claim'], [{ claim_id: '' }, 'invalid_claim']]) {
    const result = run({ claims: [claim(changes)] });
    success(result);
    assert.equal(result.report.matched.length, 0);
    assert.equal(result.report[category].length, 1);
  }
});

test('strict CSV handles quoted names but rejects ambiguous columns and malformed quotes', () => {
  const valid = run({ rows: [expected({ claimant_name: 'Synthetic, "Quoted" Owner' })] });
  success(valid);
  assert.equal(valid.report.matched.length, 1);
  for (const csvText of ['', headers + '\n', headers + '\nreward-001,too,few\n',
    headers.replace('token', 'amount') + '\n', headers + '\n"unterminated',
    headers + '\n"reward-001"x,name,wallet,evm,5,USDC\n']) rejected(run({ csvText }));
});

test('malformed/oversized JSON and batches fail with fixed no-content diagnostics', () => {
  for (const jsonText of ['{"PRIVATE_BODY_MARKER":', '{}', 'null', '[null]', '[5]', '[]PRIVATE_BODY_MARKER',
    JSON.stringify([claim()]).repeat(30000)]) rejected(run({ jsonText }));
  rejected(run({ claims: Array.from({ length: 51 }, (_, i) => claim({ claim_id: `reward-${i}` })) }));
  rejected(run({ extra: ['--cap', '100', '--cap', '200'] }));
  rejected(run({ extra: ['--unexpected', 'PRIVATE_BODY_MARKER'] }));
});

test('existing output is preserved and repeated runs explicitly lack durable replay proof', () => {
  const preserved = run({ priorOutput: 'SYNTHETIC_SENTINEL' });
  assert.equal(preserved.status, 2);
  assert.equal(preserved.output, 'SYNTHETIC_SENTINEL');
  const first = run(), second = run();
  success(first); success(second);
  assert.equal(first.report.matched.length, 1);
  assert.equal(second.report.matched.length, 1);
  assert.equal(second.report.scope.replay_protection, 'in_run_only');
});
