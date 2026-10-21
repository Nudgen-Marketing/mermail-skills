// Actual offline evaluator/CLI regressions; no provider or payment effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateClaim } from './refund-policy.mjs';

const base = new URL('./examples/', import.meta.url);
const ledger = JSON.parse(await readFile(new URL('ledger.json', base), 'utf8'));
const policy = JSON.parse(await readFile(new URL('policy.json', base), 'utf8'));
const claim = JSON.parse(await readFile(new URL('claim-1042.json', base), 'utf8'));
const fresh = () => [structuredClone(ledger), structuredClone(policy)];
function check(mutate, reason) {
  const [l, p] = fresh(); mutate(l.orders[0], l, p);
  const result = evaluateClaim(claim, l, p);
  assert.equal(result.reason_code, reason);
  assert.notEqual(result.disposition, 'eligible'); assert.equal(result.payout, undefined);
}
for (const [name, mutate, reason] of [
  ['duplicate charge ID', o => o.charges[1].charge_id = o.charges[0].charge_id, 'invalid_charge_evidence'],
  ['missing charge ID', o => delete o.charges[0].charge_id, 'invalid_charge_evidence'],
  ['negative charges', o => o.charges.forEach(c => c.amount = -29), 'invalid_charge_evidence'],
  ['zero charges', o => o.charges.forEach(c => c.amount = 0), 'invalid_charge_evidence'],
  ['unknown extra charge', o => o.charges.push({charge_id:'extra', amount:29, status:'unrecognized'}), 'unsettled_charge_present'],
  ['refunded charge', o => o.charges[0].status = 'refunded', 'already_refunded'],
  ['pending prior refund', o => o.prior_refunds = [{status:'pending'}], 'prior_refund_requires_reconciliation'],
  ['malformed prior refund', o => o.prior_refunds = [null], 'prior_refund_requires_reconciliation'],
  ['missing history', o => delete o.prior_refunds, 'refund_history_unavailable'],
  ['ambiguous order', (o,l) => l.orders.push({...o, customer_email:'other@example.com'}), 'ambiguous_order_reference'],
  ['null asset with open list', (o,l,p) => {o.payout.asset=null; p.allowed_assets=[];}, 'asset_or_chain_not_allowed'],
  ['blank chain with open list', (o,l,p) => {o.payout.chain=' '; p.allowed_chains=[];}, 'asset_or_chain_not_allowed'],
  ['sub-epsilon unequal charges', o => {o.charges[0].amount='20'; o.charges[1].amount='20.0000000005';}, 'manual_review_amount_mismatch'],
  ['sub-epsilon over duplicate', o => {o.charges.forEach(c=>c.amount='20'); o.payout.amount='20.0000000005';}, 'amount_above_verified_duplicate'],
  ['sub-epsilon over cap', (o,l,p) => {p.max_refund_per_claim='28.9999999999';}, 'over_policy_cap'],
  ['excess precision', o => o.charges[0].amount='29.0000000000000000001', 'invalid_charge_evidence'],
  ['malformed allowlist', (o,l,p) => p.allowed_assets={}, 'invalid_input'],
  ['fractional run cap', (o,l,p) => p.max_refunds_per_run=1.5, 'invalid_input'],
]) test(name, () => check(mutate, reason));

test('positive exact decimal strings retain the owner payout value', () => {
  const [l,p]=fresh(); const o=l.orders[0];
  o.charges.forEach(c=>c.amount='29.000000000000000001'); o.payout.amount='29.000000000000000001';
  const result=evaluateClaim(claim,l,p);
  assert.equal(result.disposition,'eligible'); assert.equal(result.payout.amount,o.payout.amount);
});
test('malformed run state never silently resets eligibility counters', () => {
  for (const run of [null, [], {paidThisRun:-1}, {paidThisRun:1.5}, {alreadyHandled:'1042'}])
    assert.equal(evaluateClaim(claim,ledger,policy,run).reason_code,'invalid_input');
});
test('actual CLI holds duplicate charge evidence and rejects malformed caps', async (t) => {
  const dir=await mkdtemp(join(tmpdir(),'refund-regression-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const [l,p]=fresh(); l.orders[0].charges[1].charge_id=l.orders[0].charges[0].charge_id;
  const paths=['claim','ledger','policy'].map(n=>`${dir}/${n}.json`);
  await Promise.all([claim,l,p].map((v,i)=>writeFile(paths[i],JSON.stringify(v))));
  const args=[fileURLToPath(new URL('./refund-policy.mjs',import.meta.url)), '--claim',paths[0],'--ledger',paths[1],'--policy',paths[2]];
  assert.equal(JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'})).reason_code,'invalid_charge_evidence');
  p.max_refunds_per_run=-1; await writeFile(paths[2],JSON.stringify(p));
  assert.throws(()=>execFileSync(process.execPath,args,{encoding:'utf8'}),e=>e.status===2 && JSON.parse(e.stdout).reason_code==='invalid_input');
});
