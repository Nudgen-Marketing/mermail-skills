import test from 'node:test';import assert from 'node:assert/strict';
import {projectTasks} from '../skills/mermail-action-brief/scripts/project-tasks.mjs';
const scope=()=>({workspaceId:'w',mailboxId:'m',now:'2026-10-19T12:00:00.000Z',coverageComplete:true,sentReviewed:true,staleDays:3});
const message=(x={})=>({workspaceId:'w',mailboxId:'m',id:'e',threadId:'t',at:'2026-10-15T12:00:00.000Z',direction:'inbound',scanStatus:'clean',safeContent:true,nativeHold:false,contentOmitted:false,truncated:false,authoredSeparated:true,bodyChars:100,...x});
const observation=(x={})=>({actionId:'a',messageId:'e',quoted:false,title:'Review the selected proposal',ownerRole:'owner',kind:'request',status:'open',confidence:'high',...x});
const run=(o=[observation()],m=[message()],s=scope())=>projectTasks(s,m,o);
test('one email can produce several source-linked tasks without effects',()=>{
 const r=run([observation(),observation({actionId:'b',title:'Provide delivery dates'})]);assert.equal(r.extractedTasks.length,2);assert.equal(r.authorization,'none');assert.deepEqual(r.extractedTasks[0].sourceIds,['e']);
});
test('owner ask and outbound promise are owner obligations',()=>{
 assert.equal(run().extractedTasks[0].class,'i_owe');assert.equal(run([observation({kind:'promise'})],[message({direction:'outbound'})]).extractedTasks[0].class,'i_owe');
});
test('outbound request waits or becomes stale only with reviewed Sent/current coverage',()=>{
 const o=[observation({ownerRole:'other'})],m=[message({direction:'outbound'})];assert.equal(run(o,m).extractedTasks[0].class,'stale_followup');
 for(const patch of[{coverageComplete:false},{sentReviewed:false}]){const r=run(o,m,{...scope(),...patch}).extractedTasks[0];assert.equal(r.class,'waiting_on_others');assert.equal(r.provisional,true);}
});
test('new relevant reply resets stale clock but acknowledgement alone does not fulfill',()=>{
 const r=run([observation({ownerRole:'other',lastRelevantMessageId:'reply'})],[message({direction:'outbound'}),message({id:'reply',at:'2026-10-19T00:00:00.000Z'})]);assert.equal(r.extractedTasks[0].class,'waiting_on_others');assert.deepEqual(r.extractedTasks[0].sourceIds,['e','reply']);
});
test('resolution needs explicit same-action evidence and complete reviewed scope',()=>{
 const o=[observation({status:'fulfilled',resolutionMessageId:'done',resolutionExplicit:true})],m=[message(),message({id:'done',at:'2026-10-18T12:00:00.000Z'})];assert.equal(run(o,m).extractedTasks[0].class,'resolved_in_reviewed_scope');
 assert.equal(run([{...o[0],resolutionExplicit:false}],m).extractedTasks[0].class,'needs_clarification');assert.equal(run(o,m,{...scope(),coverageComplete:false}).extractedTasks[0].class,'needs_clarification');
});
test('explicit deadline ranks, sender urgency and ambiguous due hint do not',()=>{
 assert.equal(run([observation({title:'URGENT: review proposal',dueHint:'Friday'})]).extractedTasks[0].priority,'P2');
 for(const [dueAt,priority]of[['2026-10-19T11:00:00.000Z','P0'],['2026-10-20T12:00:00.000Z','P0'],['2026-10-24T12:00:00.000Z','P1'],['2026-11-01T12:00:00.000Z','P2']])assert.equal(run([observation({dueAt})]).extractedTasks[0].priority,priority);
 assert.throws(()=>run([observation({dueAt:'tomorrow'})]));assert.throws(()=>run([observation({dueAt:'2026-02-30T00:00:00.000Z'})]));
});
test('quoted, unsafe or incomplete evidence yields metadata-only blocked rows',()=>{
 assert.equal(run([observation({quoted:true})]).extractedTasks[0].class,'blocked');
 for(const patch of[{scanStatus:'skipped'},{safeContent:false},{nativeHold:true},{contentOmitted:true},{truncated:true},{bodyChars:6001},{authoredSeparated:false}]){const r=run(undefined,[message(patch)]).extractedTasks[0];assert.equal(r.class,'blocked');assert.equal(r.title,undefined);}
});
test('cross-workspace/mailbox rows and cross-thread resolution cannot match',()=>{
 for(const patch of[{workspaceId:'other'},{mailboxId:'other'}])assert.throws(()=>run(undefined,[message(patch)]));
 const r=run([observation({status:'fulfilled',resolutionExplicit:true,resolutionMessageId:'done'})],[message(),message({id:'done',threadId:'other'})]);assert.equal(r.extractedTasks[0].class,'needs_clarification');
});
test('conflicting observations stay visible; identical copies deduplicate',()=>{
 assert.equal(run([observation(),observation()]).extractedTasks.length,1);
 assert.equal(run([observation(),observation({dueHint:'different'})]).extractedTasks[0].class,'needs_clarification');assert.throws(()=>run(undefined,[message(),message({direction:'outbound'})]));
});
test('unknown assignee and FYI remain distinct; inputs are not mutated',()=>{
 const o=[observation({ownerRole:'unknown'}),observation({actionId:'fyi',kind:'fyi'})],m=[message()],before=JSON.stringify([o,m]);const r=run(o,m);assert.equal(r.counts.needs_clarification,1);assert.equal(r.counts.fyi_no_action,1);assert.equal(JSON.stringify([o,m]),before);
});
test('elapsed completed-day threshold and all bounds fail closed',()=>{
 const o=[observation({ownerRole:'other'})],m=[message({direction:'outbound',at:'2026-10-16T12:00:00.000Z'})];assert.equal(run(o,m).extractedTasks[0].class,'stale_followup');
 assert.equal(run(o,[{...m[0],at:'2026-10-16T12:00:00.001Z'}]).extractedTasks[0].class,'waiting_on_others');
 assert.throws(()=>run(o,m,{...scope(),staleDays:0}));assert.throws(()=>run([],Array.from({length:21},(_,i)=>message({id:String(i)}))));assert.throws(()=>run([],Array.from({length:11},(_,i)=>message({id:String(i)}))));
});
test('conflicting deadlines retain every safe source and competing term',()=>{
 const tasks=run([observation({dueAt:'2026-10-20T00:00:00.000Z'}),
  observation({messageId:'other',dueAt:'2026-10-21T00:00:00.000Z'})],
  [message(),message({id:'other',at:'2026-10-18T12:00:00.000Z'})]).extractedTasks;
 assert.equal(tasks[0].class,'needs_clarification');assert.deepEqual(tasks[0].sourceIds,['e','other']);
 assert.deepEqual(tasks[0].conflictingObservations.map(x=>x.dueAt),['2026-10-20T00:00:00.000Z','2026-10-21T00:00:00.000Z']);
 const blocked=run([observation(),observation({messageId:'unsafe',title:'Do not reproduce omitted content'})],
  [message(),message({id:'unsafe',scanStatus:'unknown'})]).extractedTasks[0];
 assert.equal(blocked.class,'blocked');assert.equal(blocked.conflictingObservations,undefined);
});
test('fulfilled and FYI historical due dates cannot outrank actionable work',()=>{
 const result=run([observation({status:'fulfilled',resolutionMessageId:'done',resolutionExplicit:true,dueAt:'2026-10-16T00:00:00.000Z'}),
  observation({actionId:'active',dueAt:'2026-10-20T00:00:00.000Z'}),
  observation({actionId:'fyi',kind:'fyi',dueAt:'2026-10-15T00:00:00.000Z'})],
  [message(),message({id:'done',at:'2026-10-18T12:00:00.000Z'})]);
 assert.equal(result.extractedTasks[0].actionId,'active');
 for(const task of result.extractedTasks.slice(1)){
  assert.equal(task.priority,'P3');assert.equal(task.priorityBasis,'non_actionable_history');
 }
});
