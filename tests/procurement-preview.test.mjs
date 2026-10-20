import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {preview,audit} from '../skills/mermail-nice-try/scripts/procurement-preview.mjs';
const digest=createHash('sha256').update('synthetic reviewed offer').digest('hex');
const scope={workspaceId:'w-one',mailboxId:'m-one',vendor:'vendor@example.com',sessionId:'procurement-one'};
function fixture() { return {action:'preview',constraints:{...scope,now:'2026-10-20T01:00:00.000Z',dispatchedAt:'2026-10-20T00:00:00.000Z',readUsage:{calls:3,metadataMessages:10,bodyMessages:1,bodyChars:300},currency:'USD',quantity:100,cap:'50',capBasis:'total',maxRounds:3,sentRounds:1,priorIntent:'sent',baselineComplete:true,baselineIds:['old-message'],boundThreadId:'thread-one',seen:[]},offer:{...scope,receivedAt:'2026-10-20T00:10:00.000Z',authoredOnly:true,bodyChars:300,currency:'USD',quantity:100,unitPrice:'0.45',extrasTotal:'0',costsComplete:true,termsComplete:true,threadId:'thread-one',messageId:'new-offer',digest,reviewedRound:2,scanStatus:'clean',senderAuthentication:'pass',nativeHold:false,truncated:false,contentOmitted:false,agentSafeContent:true}}; }
test('opening stays draft-only; total and unit caps are explicit',()=>{
 const f=fixture(); delete f.offer; Object.assign(f.constraints,{sentRounds:0,priorIntent:'none',boundThreadId:null});
 assert.equal(preview(f).status,'opening_draft_only'); assert.equal(preview(f).totalCap,'50');
 Object.assign(f.constraints,{cap:'0.50',capBasis:'unit'}); assert.equal(preview(f).totalCap,'50');
 delete f.constraints.capBasis; assert.equal(preview(f).reason,'ambiguous_cap_basis');
});
test('100 x 0.45 is exactly 45; 0.60 over total 50 is not eligible',()=>{
 const f=fixture(); assert.deepEqual([preview(f).total,preview(f).totalMinor,preview(f).status],['45','4500','price_eligible_not_accepted']);
 f.offer.unitPrice='0.60'; assert.equal(preview(f).status,'counter_or_clarify');
});
test('fractional unit arithmetic and extras cannot cross the cap silently',()=>{
 const f=fixture(); f.offer.unitPrice='0.525'; assert.equal(preview(f).total,'52.5');
 assert.equal(preview(f).status,'counter_or_clarify');
 Object.assign(f.constraints,{cap:'0.50',capBasis:'unit'}); Object.assign(f.offer,{unitPrice:'0.50',extrasTotal:'0.01'});
 assert.equal(preview(f).status,'counter_or_clarify');
 f.offer.extrasTotal='0.000001'; assert.equal(preview(f).reason,'nonrepresentable_currency_total');
});
test('currency exponent, malformed money, quantity and unknown costs stop',()=>{
 for(const [key,value] of [['currency','EUR'],['quantity',101],['costsComplete',false],['termsComplete',false],['extrasTotal',undefined],['unitPrice','NaN'],['unitPrice','1e2'],['unitPrice','-1']]){
  const f=fixture(); f.offer[key]=value; assert.equal(preview(f).status,'hold',key);
 }
 const f=fixture(); f.constraints.currency='VND'; f.offer.currency='VND'; f.offer.unitPrice='0.451'; assert.equal(preview(f).reason,'nonrepresentable_currency_total');
 f.constraints.currency='UNKNOWN'; assert.equal(preview(f).reason,'unsupported_currency');
});
test('scope, bound thread and source version are exact',()=>{
 for(const key of [...Object.keys(scope),'threadId','digest']){const f=fixture();f.offer[key]='wrong';assert.equal(preview(f).status,'hold',key);}
 const f=fixture();f.offer.messageId='old-message';assert.equal(preview(f).reason,'baseline_offer');
});
test('native hold, unknown sender or incomplete evidence never becomes a quote',()=>{
 for(const [key,value] of [['scanStatus','unknown'],['senderAuthentication','unknown'],['nativeHold',true],['truncated',true],['contentOmitted',true],['agentSafeContent',false]]){
  const f=fixture();f.offer[key]=value;assert.equal(preview(f).reason,'unsafe_or_incomplete_evidence',key);
  delete f.offer[key];assert.equal(preview(f).reason,'unsafe_or_incomplete_evidence',key);
 }
});
test('duplicate/conflicting source and stale or forged future rounds stop',()=>{
 const f=fixture();f.constraints.seen=[{messageId:f.offer.messageId,digest}];assert.equal(preview(f).reason,'duplicate_offer');
 f.constraints.seen[0].digest=createHash('sha256').update('conflict').digest('hex');assert.equal(preview(f).reason,'conflicting_offer_version');
 f.constraints.seen=[];for(const round of [1,3,'2']){f.offer.reviewedRound=round;assert.equal(preview(f).status,'hold');}
});
test('bounded rounds and pending/unknown intents hold across resume',()=>{
 for(const priorIntent of ['pending','unknown',undefined]){const f=fixture();f.constraints.priorIntent=priorIntent;assert.equal(preview(f).reason,'unresolved_prior_intent');}
 const f=fixture();f.constraints.sentRounds=3;assert.equal(preview(f).reason,'round_budget_exhausted');
 f.constraints.sentRounds=1;f.constraints.baselineComplete=false;assert.equal(preview(f).reason,'incomplete_baseline');
});
test('source time is after authoritative dispatch, not future or unknown',()=>{
 for(const receivedAt of ['2026-10-19T23:59:00.000Z','2026-10-20T00:00:00.000Z','2026-10-20T02:00:00.000Z','yesterday',undefined]){const f=fixture();f.offer.receivedAt=receivedAt;assert.equal(preview(f).reason,'offer_outside_dispatched_window');}
 const f=fixture();delete f.constraints.dispatchedAt;assert.equal(preview(f).reason,'offer_outside_dispatched_window');
});
test('authored material and shared per-turn budgets are mandatory',()=>{
 for(const [key,value] of [['authoredOnly',false],['bodyChars',10001],['bodyChars',undefined]]){const f=fixture();f.offer[key]=value;assert.equal(preview(f).reason,'unbounded_or_quoted_offer');}
 for(const [key,value] of [['calls',13],['metadataMessages',201],['bodyMessages',9],['bodyChars',50001]]){const f=fixture();f.constraints.readUsage[key]=value;assert.equal(preview(f).reason,'read_budget_exceeded_or_unknown');}
 const f=fixture();delete f.constraints.readUsage;assert.equal(preview(f).reason,'read_budget_exceeded_or_unknown');
});
test('audit is owner-requested private preview only, preserves evidence and no write/delivery claim',()=>{
 const f=fixture();assert.throws(()=>audit(f),/private_audit_not_authorized/);
 Object.assign(f,{ownerRequested:true,destination:'local_private'});const r=audit(f);assert.equal(r.constraints.cap,'50');assert.equal(r.evidence.sourceDigest,digest);assert.equal(r.fileWritten,false);assert.equal(r.delivered,false);assert.equal(r.review.sendAuthorized,false);
 f.destination='email';assert.throws(()=>audit(f),/private_audit_not_authorized/);
 f.destination='local_private';f.offer.workspaceId='foreign';assert.throws(()=>audit(f),/audit_requires_valid_scoped_preview/);
});
test('private audit retains terminal/uncertain holds without reopening negotiation',()=>{
 const f=fixture();Object.assign(f,{ownerRequested:true,destination:'local_private'});f.constraints.sentRounds=3;
 assert.equal(audit(f).review.reason,'round_budget_exhausted');assert.equal(audit(f).review.sendAuthorized,false);
 f.constraints.sentRounds=1;f.constraints.priorIntent='unknown';assert.equal(audit(f).constraints.priorIntent,'unknown');
 f.offer.mailboxId='foreign';assert.throws(()=>audit(f),/audit_scope_mismatch/);
 delete f.offer;f.constraints.baselineComplete=false;assert.throws(()=>audit(f),/audit_requires_valid_scoped_preview/);
});
test('CLI JSON produces actual preview; invalid, overlarge and unauthorized audit exit nonzero',()=>{
 const script=new URL('../skills/mermail-nice-try/scripts/procurement-preview.mjs',import.meta.url);
 const run=input=>spawnSync(process.execPath,[script.pathname],{input,encoding:'utf8',env:{PATH:process.env.PATH}});
 const f=fixture();const r=run(JSON.stringify(f));assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),preview(f));
 for(const raw of ['{',' '.repeat(1048577),JSON.stringify({...f,action:'audit'}),JSON.stringify({...f,action:'send'})])assert.equal(run(raw).status,2);
});
