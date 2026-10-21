// Actual offline tests against the locked ical.js parser and reconciliation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, reconcileInvites } from '../skills/mermail-invite-reconcile/scripts/reconcile.mjs';
function invite(sequence=1, organizer='mailto:owner@example.com') {
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Offline prior regression//EN\nMETHOD:REQUEST\nBEGIN:VEVENT\nUID:prior-event\nORGANIZER:${organizer}\nSEQUENCE:${sequence}\nDTSTAMP:20261020T120000Z\nDTSTART:20261022T120000Z\nDTEND:20261022T130000Z\nSUMMARY:Prior review\nEND:VEVENT\nEND:VCALENDAR\n`;
}
function prior() {
  const result=reconcileInvites([{label:'original',ics:invite()}]);
  assert.equal(result.safeToUseWinners,true);
  return JSON.parse(JSON.stringify(result.winners));
}
const key='prior-event\u0000mailto:owner@example.com';
function held(value,inputs=[]) {
  const result=reconcileInvites(inputs,value);
  assert.equal(result.safeToUseWinners,false); assert.equal(result.hasReview,true);
  assert.deepEqual(result.winners,{}); assert.equal(result.decisions[0].decision,'needs_review');
}
test('real parser output survives JSON roundtrip and prior-only review',()=>{
  const p=prior(); const before=JSON.stringify(p); const result=reconcileInvites([],p);
  assert.equal(result.safeToUseWinners,true); assert.deepEqual(result.winners,p);
  assert.equal(JSON.stringify(p),before);
});
test('valid prior participates in newer, stale, duplicate and conflict decisions',()=>{
  for(const [sequence,decision] of [[2,'accepted'],[0,'stale_ignored'],[1,'duplicate']]) {
    const result=reconcileInvites([{ics:invite(sequence)}],prior());
    assert.equal(result.decisions[0].decision,decision); assert.equal(result.safeToUseWinners,true);
  }
  const conflict=reconcileInvites([{ics:invite().replace('SUMMARY:Prior review','SUMMARY:Changed')}],prior());
  assert.equal(conflict.safeToUseWinners,false); assert.deepEqual(conflict.winners,{});
});
test('unavailable or malformed prior is not an empty initial state',()=>{
  for(const p of [undefined,null,[],'unavailable',7,{bad:null},{bad:{}}]) held(p);
});
test('prior keys and comparison fields must agree with canonical evidence',()=>{
  for(const mutate of [
    p=>{p['wrong-key']=p[key];delete p[key];},
    p=>p[key].uid='other',p=>p[key].organizer='mailto:other@example.com',
    p=>p[key].sequence=2,p=>p[key].sequence=-1,p=>p[key].sequence=1.5,
    p=>p[key].dtstart='2026-10-22T12:30:00Z',p=>p[key].dtend='2026-10-22T11:00:00Z',
    p=>p[key].dtstamp='2026-02-30T12:00:00Z',p=>p[key].canonical='[]',p=>p[key].canonical='{',
    p=>p[key].canonical=JSON.stringify([{name:'uid',params:{},type:'text',values:['prior-event']}]),
    p=>delete p[key].canonical,p=>p[key].unknown='unverified',
  ]) {const p=prior();mutate(p);held(p);}
});
test('two valid organizer records for one UID block even an empty input batch',()=>{
  const p=prior();const second=parseInvite(invite(2,'mailto:other@example.com'));
  assert.equal(second.ok,true);p['prior-event\u0000mailto:other@example.com']=second.event;
  held(p);held(p,[{ics:invite(3)}]);
});
test('malformed canonical rows and recurrence cannot be smuggled through prior',()=>{
  for(const row of [null,{name:'rrule',params:{},type:'recur',values:[{freq:'WEEKLY'}]},
    {name:'dtstamp',params:{},type:'date-time',values:['2026-10-20T12:00:00Z']},
    {name:'summary',params:[],type:'text',values:['test']}]) {
    const p=prior();const rows=JSON.parse(p[key].canonical);rows.push(row);
    p[key].canonical=JSON.stringify(rows);held(p);
  }
});
test('invalid prior is not implicitly repaired by a newer incoming invite',()=>{
  const p=prior();p[key].sequence=99;held(p,[{ics:invite(100)}]);
});
test('bounded prior rejects oversized UTF8 and more than 100 events',()=>{
  const p=prior();p[key].canonical='😀'.repeat(262145);held(p);
  const many={};for(let i=0;i<101;i++)many[String(i)]={};held(many);
});
