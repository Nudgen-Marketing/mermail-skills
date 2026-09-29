import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckpoint,classifyResume} from '../skills/mermail-agent-inbox/scripts/resume-inbox.mjs';

const scope=()=>({version:1,flowId:'signup-1',workspaceId:'ws-1',mailboxId:'mb-1',recipient:'resume@example.com',sender:{type:'address',value:'verify@example.org'},subjects:['Confirm signup'],triggeredAt:'2026-09-08T08:00:00.000Z',pausedAt:'2026-09-08T08:02:00.000Z',baselineIds:['old-1']});
const message=(extra={})=>({id:'new-1',mailboxId:'mb-1',from:'verify@example.org',to:['resume@example.com'],subject:'Confirm signup',receivedAt:'2026-09-08T09:00:00.000Z',scanStatus:'clean',...extra});
const context=(extra={})=>({workspaceId:'ws-1',mailboxId:'mb-1',recipient:'resume@example.com',now:'2026-09-08T18:00:00.000Z',complete:true,...extra});
const classify=(records,ctx={},cp=scope())=>classifyResume(cp,records,context(ctx));

test('arrival during a ten-hour absence uses original trigger and does not grant use',()=>{
  assert.deepEqual(classify([message()]),{state:'candidate',ids:['new-1'],excluded:[],scanStatus:'clean',senderAuth:'unknown',freshness:'not_assessed',externalUseAuthorized:false});
});
test('checkpoint normalization preserves baseline and never mutates input',()=>{const s=scope();s.recipient='Resume@Example.COM';s.subjects=['  CONFIRM   signup  '];const c=createCheckpoint(s);assert.equal(c.recipient,'resume@example.com');assert.deepEqual(c.subjects,['confirm signup']);assert.equal(s.recipient,'Resume@Example.COM');assert.deepEqual(c.baselineIds,['old-1']);});
for(const field of ['body','otp','magicLink','apiKey','approval','validated']) test(`checkpoint refuses unexpected ${field}`,()=>assert.throws(()=>createCheckpoint({...scope(),[field]:'DO-NOT-PERSIST'}),TypeError));
test('checkpoint rejects nested unexpected fields',()=>assert.throws(()=>createCheckpoint({...scope(),sender:{type:'address',value:'verify@example.org',body:'DO-NOT-PERSIST'}}),TypeError));
test('checkpoint rejects bidi and terminal controls',()=>{for(const value of ['Confirm\u202esignup','Confirm\u001bsignup'])assert.throws(()=>createCheckpoint({...scope(),subjects:[value]}),TypeError);});
test('checkpoint rejects invalid calendar dates',()=>assert.throws(()=>createCheckpoint({...scope(),triggeredAt:'2026-02-30T08:00:00Z'}),TypeError));
test('checkpoint rejects more than 100 baseline IDs',()=>assert.throws(()=>createCheckpoint({...scope(),baselineIds:Array.from({length:101},(_,i)=>'m-'+i)}),TypeError));
test('checkpoint requires explicit scope fields',()=>{const s=scope();delete s.triggeredAt;assert.throws(()=>createCheckpoint(s),TypeError);});
for(const field of ['workspaceId','mailboxId','recipient'])test(`live ${field} mismatch stops before selection`,()=>assert.equal(classify([message()],{[field]:'different'}).state,'scope_mismatch'));
test('no matching mail remains pending',()=>assert.equal(classify([]).state,'pending'));
test('pre-trigger and baseline messages are excluded without deleting',()=>assert.deepEqual(classify([message({id:'old-1'}),message({id:'old-2',receivedAt:'2026-09-08T07:59:59Z'})]).excluded,[{id:'old-1',reason:'baseline'},{id:'old-2',reason:'pre_trigger'}]));
for(const [field,value,reason] of [['from','attacker@example.net','sender'],['to',['other@example.com'],'recipient'],['subject','Different workflow','subject'],['mailboxId','mb-2','mailbox']])test(`reject ${reason} mismatch`,()=>{const r=classify([message({[field]:value})]);assert.equal(r.state,'pending');assert.equal(r.excluded[0].reason,reason);});
test('domain matching allows proper subdomains and rejects suffix lookalikes',()=>{const s=scope();s.sender={type:'domain',value:'example.org'};assert.equal(classify([message({from:'verify@mail.example.org'})],{},s).state,'candidate');for(const from of ['verify@evilexample.org','verify@example.org.evil.test'])assert.equal(classify([message({from})],{},s).state,'pending');});
test('multiple matching arrivals stay ambiguous despite newest-first order',()=>assert.equal(classify([message({id:'later',receivedAt:'2026-09-08T17:00:00Z'}),message()]).state,'ambiguous'));
test('identical pagination overlap deduplicates by stable ID',()=>assert.equal(classify([message(),message()]).state,'candidate'));
test('conflicting records for same ID require a fresh read',()=>assert.equal(classify([message(),message({scanStatus:'flagged'})]).state,'incomplete'));
test('single flagged record stays quarantined',()=>assert.equal(classify([message({scanStatus:'flagged'})]).state,'quarantined'));
for(const scanStatus of ['unknown','skipped',undefined])test(`scan ${scanStatus} remains metadata-only`,()=>assert.equal(classify([message({scanStatus})]).state,'metadata_only'));
test('provider pass is reported without granting external use',()=>{const r=classify([message({senderAuth:'pass'})]);assert.equal(r.senderAuth,'pass');assert.equal(r.externalUseAuthorized,false);});
test('untrusted raw auth header cannot manufacture pass',()=>assert.equal(classify([message({authenticationResults:'spf=pass dkim=pass'})]).senderAuth,'unknown'));
test('an unfinished search never establishes uniqueness',()=>assert.equal(classify([message()],{complete:false}).state,'incomplete'));
test('future timestamp makes evidence incomplete',()=>assert.equal(classify([message({receivedAt:'2026-09-09T09:00:00Z'})]).state,'incomplete'));
test('malformed record is not silently dropped alongside a valid match',()=>assert.equal(classify([message(),{subject:'Confirm signup'}]).state,'incomplete'));
test('controller time before pause is invalid',()=>assert.equal(classify([message()],{now:'2026-09-08T08:01:00Z'}).state,'incomplete'));
test('excessive pages are bounded',()=>assert.equal(classify(Array.from({length:101},(_,i)=>message({id:'m-'+i}))).state,'incomplete'));
test('output excludes raw content and secrets even if the caller supplied them',()=>{const r=classify([message({body:'DO-NOT-RETURN',otp:'DO-NOT-RETURN',magicLink:'https://secret.example/DO-NOT-RETURN',extra:{apiKey:'DO-NOT-RETURN'}})]);assert.ok(!JSON.stringify(r).includes('DO-NOT-RETURN'));});
