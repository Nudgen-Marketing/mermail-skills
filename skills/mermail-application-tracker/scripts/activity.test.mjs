import test from 'node:test';
import assert from 'node:assert/strict';
import {activityWindow} from './activity.mjs';
const sample={timestamps:['2026-10-01T12:00:00Z'],now:'2026-10-16T12:00:00Z'};
test('default calendar policy measures complete days, never send authority',()=>{
  const x=activityWindow(sample);assert.equal(x.elapsedWholeDays,15);assert.equal(x.windowElapsed,true);assert.equal(x.authorizesEffect,false);
});
test('a newer source touch wins over older activity and quoted application date',()=>{
  const x=activityWindow({...sample,timestamps:[...sample.timestamps,'2026-10-15T12:00:00Z'],applicationDate:'2026-09-01'});
  assert.equal(x.elapsedWholeDays,1);assert.equal(x.windowElapsed,false);
});
test('source ordering and duplicated timestamps do not change the newest touch',()=>{
  const t=['2026-10-15T12:00:00Z',...sample.timestamps,'2026-10-15T12:00:00Z'];
  assert.deepEqual(activityWindow({...sample,timestamps:t}),activityWindow({...sample,timestamps:[...t].reverse()}));
});
test('equivalent offset instants do not create an artificial later touch',()=>{
  assert.equal(activityWindow({...sample,timestamps:['2026-10-01T19:00:00+07:00']}).latestAt,'2026-10-01T12:00:00.000Z');
});
test('crossing midnight is not one complete elapsed day',()=>assert.equal(activityWindow({timestamps:['2026-10-01T23:59:00Z'],now:'2026-10-02T00:01:00Z',quietDays:1}).windowElapsed,false));
test('business days never reuse calendar-day eligibility',()=>{
  const x=activityWindow({...sample,mode:'business_days',quietDays:5});assert.equal(x.windowElapsed,null);assert.equal(x.state,'needs_business_calendar');
});
test('missing offset or date-only source is rejected',()=>{
  for(const value of ['2026-10-01','2026-10-01T12:00:00'])assert.throws(()=>activityWindow({...sample,timestamps:[value]}));
});
test('invalid calendar and future activity are rejected',()=>{
  for(const value of ['2026-02-30T12:00:00Z','2026-10-17T12:00:00Z','2026-10-01T24:00:00Z'])assert.throws(()=>activityWindow({...sample,timestamps:[value]}));
});
test('quiet windows and input remain finite',()=>{
  for(const quietDays of [0,-1,1.5,Infinity,3651])assert.throws(()=>activityWindow({...sample,quietDays}));
  assert.throws(()=>activityWindow({...sample,timestamps:[]}));assert.throws(()=>activityWindow({...sample,timestamps:Array(21).fill(sample.timestamps[0])}));
});
