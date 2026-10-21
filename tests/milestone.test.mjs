import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMilestone, calculateSplits } from '../skills/mermail-milestone-desk/scripts/milestone.mjs';

const allocations = (amount, percentages) => calculateSplits(amount, percentages).splits.map((share) => share.amountMicro);

test('previous negative-final-share case preserves exact agreed percentages', () => {
  const result = calculateSplits('100', '33.3336,33.3336,33.3327,0.0001');
  assert.deepEqual(result.splits.map((share) => share.amountMicro), ['33333600', '33333600', '33332700', '100']);
  assert.equal(result.splits.reduce((sum, share) => sum + BigInt(share.amountMicro), 0n), BigInt(result.totalMicro));
  assert.ok(result.splits.every((share) => BigInt(share.amountMicro) >= 0n));
});

test('micro-unit dust follows exact largest remainders with stable ties and zero shares', () => {
  assert.deepEqual(allocations('0.000001', '50,50'), ['1', '0']);
  assert.deepEqual(allocations('0.000001', '0,50,50'), ['0', '1', '0']);
  assert.deepEqual(allocations('0.000002', '33.333333333333333333,33.333333333333333333,33.333333333333333334'), ['1', '0', '1']);
  assert.deepEqual(allocations('0', '0,100,0'), ['0', '0', '0']);
  assert.deepEqual(allocations('12.345678', '100'), ['12345678']);
});

test('large amounts and sub-cent amounts retain exact string pricing', () => {
  const amount = '90071992547409931234567890.123456';
  const result = calculateSplits(amount, '50,50');
  assert.equal(result.totalUsd, amount);
  assert.equal(result.totalMicro, '90071992547409931234567890123456');
  assert.deepEqual(result.splits.map((share) => share.amountUsd), ['45035996273704965617283945.061728', '45035996273704965617283945.061728']);
  const manifest = createMilestone('Project', 'Milestone', amount, 'artifact');
  assert.equal(manifest.amountUsd, amount);
  assert.equal(manifest.amountMicro, result.totalMicro);
  assert.equal(manifest.amountCents, null);
  assert.equal(createMilestone('Project', 'Milestone', '9007199254740993.01').amountCents, '900719925474099301');
  assert.equal(createMilestone('Project', 'Milestone', '0.000001').amountUsd, '0.000001');
  assert.equal(createMilestone('Project', 'Milestone', '1.0').termsHash, createMilestone('Project', 'Milestone', '1.000000').termsHash);
});

test('excess precision and invalid decimal amounts are rejected without rounding', () => {
  for (const amount of ['1.0000009', '0.0000001', '-1', '1e3', 'Infinity', 'NaN', '', '1.', '.5', '9'.repeat(81)]) {
    assert.throws(() => createMilestone('Project', 'Milestone', amount), /amount/);
    assert.throws(() => calculateSplits(amount, '100'), /amount/);
  }
  assert.throws(() => createMilestone('Project', 'Milestone', 1.1), /decimal string/);
});

test('percentages must be finite nonnegative decimals summing to exactly 100', () => {
  for (const percentages of ['', '0,0', '99.9999', '100.0001', '50,49.9999', '50,50.0001', '-1,101', 'NaN', 'Infinity', '1e2', '50,,50', '100.0000000000000000000']) {
    assert.throws(() => calculateSplits('100', percentages), /percentage|Percentages/);
  }
  assert.throws(() => calculateSplits('100', Array(1001).fill('0').join(',')), /1000/);
  assert.deepEqual(allocations('1', '0.00,100.0000'), ['0', '1000000']);
});

test('allocations conserve every micro-unit and remain within exact rounding bounds', () => {
  for (let total = 0n; total <= 37n; total++) {
    for (const weights of [[1n, 2n, 97n], [0n, 50n, 50n], [13n, 29n, 58n], [25n, 25n, 25n, 25n]]) {
      const amount = `0.${String(total).padStart(6, '0')}`;
      const shares = allocations(amount, weights.join(',')).map(BigInt);
      assert.equal(shares.reduce((sum, share) => sum + share, 0n), total);
      shares.forEach((share, index) => {
        const floor = total * weights[index] / 100n;
        const ceil = (total * weights[index] + 99n) / 100n;
        assert.ok(share >= floor && share <= ceil);
      });
    }
  }
});

test('CLI accepts exact prices and rejects invalid prices before emitting a manifest', () => {
  const script = fileURLToPath(new URL('../skills/mermail-milestone-desk/scripts/milestone.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const valid = run('create', 'Project', 'Milestone', '0.000001', 'artifact');
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).amountMicro, '1');
  const invalid = run('create', 'Project', 'Milestone', '1.0000009');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /exceeds 6 decimal places/);
});
