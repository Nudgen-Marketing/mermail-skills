import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentScope,compareReceiptClaims} from '../skills/mermail-procurement-agent/scripts/receipt-claims.mjs';
const expected={amount_base:'1000000',asset:'token',chain:'chain',payee:'vendor',plan:'pro',period:'monthly',purchase_reference:'order-1'};
const claim=(x={})=>({...expected,source_id:'mail-1',scan_status:'clean',native_hold:false,...x});
test('free, verify-only and external receipt paths never probe wallet across profiles',()=>{for(const scope of ['not_requested','not_required','external_checkout'])for(const profile of ['api_key','agent_inbox','oauth_full'])assert.deepEqual(paymentScope(scope,profile),{wallet_probe:false,payment_handoff:false,authorization:'none'});});
test('paid API-key path requests handoff rather than pretending wallet access',()=>{assert.equal(paymentScope('requested','api_key').payment_handoff,true);assert.equal(paymentScope('requested','agent_inbox').wallet_probe,false);assert.equal(paymentScope('requested','oauth_full').wallet_probe,true);assert.throws(()=>paymentScope('other','oauth_full'));});
test('identical receipt copies retain one business claim, not a second charge',()=>{const r=compareReceiptClaims(expected,[claim(),claim({source_id:'attachment-1'})]);assert.equal(r.verdict,'claims_consistent');assert.equal(r.unique_claims,1);assert.equal(r.settlement_verified,false);assert.equal(r.authorization,'none');});
test('later conflicting receipt cannot be overridden by first matching source',()=>{for(const claims of [[claim(),claim({source_id:'mail-2',amount_base:'2000000'})],[claim({source_id:'mail-2',amount_base:'2000000'}),claim()]]){const r=compareReceiptClaims(expected,claims);assert.equal(r.verdict,'mismatch');assert.deepEqual(r.mismatches,['amount_base']);}});
test('same source with altered business fields remains a conflict',()=>{const r=compareReceiptClaims(expected,[claim(),claim({plan:'basic'})]);assert.equal(r.verdict,'mismatch');assert.ok(r.mismatches.includes('source_conflict'));});
test('missing/unknown/skipped/flagged or native-held evidence stays pending',()=>{for(const scan_status of [undefined,'unknown','skipped','flagged'])assert.equal(compareReceiptClaims(expected,[claim({scan_status})]).verdict,'pending');assert.equal(compareReceiptClaims(expected,[claim({native_hold:true})]).verdict,'pending');assert.equal(compareReceiptClaims(expected,[]).verdict,'pending');});
test('all business dimensions compare exactly with no float rounding',()=>{for(const k of Object.keys(expected)){const r=compareReceiptClaims(expected,[claim({[k]:k==='amount_base'?'9007199254740993':'other'})]);assert.equal(r.verdict,'mismatch');assert.ok(r.mismatches.includes(k));}});
test('malformed, oversized or incomplete input never yields matching claims',()=>{assert.equal(compareReceiptClaims(expected,Array.from({length:6},()=>claim())).verdict,'malformed');for(const amount_base of ['1e6','-1','1.0',1000000])assert.equal(compareReceiptClaims({...expected,amount_base},[claim()]).verdict,'malformed');assert.equal(compareReceiptClaims(expected,[claim({plan:undefined})]).verdict,'pending');});

test('known clean mismatch survives every blocked or incomplete source in either order',()=>{
  const mismatch=claim({amount_base:'2000000'});
  const unusable=[undefined,null,claim({source_id:'mail-2',scan_status:undefined}),
    ...['unknown','skipped','flagged'].map(scan_status=>claim({source_id:'mail-2',scan_status})),
    claim({source_id:'mail-2',native_hold:true}),claim({source_id:'mail-2',native_hold:undefined}),
    claim({source_id:'mail-2',plan:undefined}),claim({source_id:'',amount_base:'1.2'})];
  for(const other of unusable) for(const claims of [[mismatch,other],[other,mismatch]]) {
    const r=compareReceiptClaims(expected,claims);
    assert.deepEqual(r,{authorization:'none',settlement_verified:false,verdict:'mismatch',
      unique_claims:1,mismatches:['amount_base'],evidence_incomplete:true});
  }
});

test('a matching source plus missing coverage remains pending in either order',()=>{
  const blocked=claim({source_id:'mail-2',scan_status:'unknown',amount_base:'9999999'});
  for(const claims of [[claim(),blocked],[blocked,claim()]]) {
    const r=compareReceiptClaims(expected,claims);
    assert.equal(r.verdict,'pending');assert.equal(r.evidence_incomplete,true);
    assert.deepEqual(r.mismatches,[]);assert.equal(r.unique_claims,1);
  }
});

test('unknown or native-held claims never expose business fields to comparison',()=>{
  for(const gate of [{scan_status:'unknown',native_hold:false},{scan_status:'clean',native_hold:true}]) {
    const blocked={...gate};
    for(const key of Object.keys(expected)) Object.defineProperty(blocked,key,{get(){throw Error('unread business field');}});
    const r=compareReceiptClaims(expected,[claim({plan:'basic'}),blocked]);
    assert.equal(r.verdict,'mismatch');assert.deepEqual(r.mismatches,['plan']);
    assert.equal(r.evidence_incomplete,true);
  }
});

test('all120 permutations retain source conflict, distinct clean claims and coverage',()=>{
  const inputs=[claim(),claim({amount_base:'2000000'}),claim({source_id:'attachment-1'}),
    claim({source_id:'blocked',scan_status:'flagged',plan:'unsafe'}),claim({source_id:'missing',period:undefined})];
  const wanted={authorization:'none',settlement_verified:false,verdict:'mismatch',unique_claims:2,
    mismatches:['amount_base','source_conflict'],evidence_incomplete:true};
  let checked=0;
  function permutations(prefix,rest) {
    if(!rest.length){assert.deepEqual(compareReceiptClaims(expected,prefix),wanted);checked++;return;}
    rest.forEach((value,i)=>permutations([...prefix,value],[...rest.slice(0,i),...rest.slice(i+1)]));
  }
  permutations([],inputs);assert.equal(checked,120);
});

test('consistent clean claims still require no authority and report complete coverage',()=>{
  const r=compareReceiptClaims(expected,[claim(),claim({source_id:'attachment-1'})]);
  assert.equal(r.verdict,'claims_consistent');assert.equal(r.evidence_incomplete,false);
  assert.equal(r.unique_claims,1);assert.equal(r.authorization,'none');assert.equal(r.settlement_verified,false);
});
