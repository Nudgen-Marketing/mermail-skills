// Optional pure metadata classifier. No I/O; no body, OTP or link processing.
const allowed = ['version','flowId','workspaceId','mailboxId','recipient','sender','subjects','triggeredAt','pausedAt','baselineIds'];
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const plain = x => typeof x === 'string' && x.length <= 200 && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(x);
const email = x => typeof x === 'string' && x.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*\.[A-Za-z]{2,}$/.test(x);
const normalized = x => x.trim().replace(/\s+/g,' ').toLowerCase();
const instant = x => {
  if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)||!Number.isFinite(Date.parse(x))) return false;
  const [whole, fraction='']=x.slice(0,-1).split('.');
  return new Date(x).toISOString()===whole+'.'+fraction.padEnd(3,'0')+'Z';
};
const fail = () => { throw new TypeError('Invalid checkpoint: use only bounded, non-secret expected-message scope.'); };

export function createCheckpoint(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) fail();
  if (Object.keys(scope).some(k=>!allowed.includes(k)) || allowed.some(k=>!Object.hasOwn(scope,k))) fail();
  if (scope.version!==1 || ![scope.flowId,scope.workspaceId,scope.mailboxId].every(id) || !email(scope.recipient)) fail();
  const s=scope.sender;
  if (!s || typeof s!=='object' || Object.keys(s).length!==2 || !Object.hasOwn(s,'type') || !Object.hasOwn(s,'value')) fail();
  if(s.type==='address' ? !email(s.value) : s.type!=='domain' || typeof s.value!=='string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(s.value) || s.value.length>253) fail();
  if(!Array.isArray(scope.subjects) || scope.subjects.length<1 || scope.subjects.length>8 || !scope.subjects.every(x=>plain(x)&&x.trim().length>0)) fail();
  if(!instant(scope.triggeredAt)||!instant(scope.pausedAt)||Date.parse(scope.pausedAt)<Date.parse(scope.triggeredAt)) fail();
  if(!Array.isArray(scope.baselineIds)||scope.baselineIds.length>100||!scope.baselineIds.every(id)) fail();
  return {version:1,flowId:scope.flowId,workspaceId:scope.workspaceId,mailboxId:scope.mailboxId,recipient:scope.recipient.toLowerCase(),sender:{type:s.type,value:s.value.toLowerCase()},subjects:[...new Set(scope.subjects.map(normalized))],triggeredAt:scope.triggeredAt,pausedAt:scope.pausedAt,baselineIds:[...new Set(scope.baselineIds)]};
}

export function classifyResume(scope, records, context) {
  const cp=createCheckpoint(scope);
  const out=(state,ids=[],excluded=[],extra={})=>({state,ids,excluded,...extra});
  if(!context || context.workspaceId!==cp.workspaceId || context.mailboxId!==cp.mailboxId || typeof context.recipient!=='string' || context.recipient.toLowerCase()!==cp.recipient) return out('scope_mismatch');
  if(!instant(context.now)||Date.parse(context.now)<Date.parse(cp.pausedAt)||!Array.isArray(records)||records.length>100) return out('incomplete',[],[],{reason:'invalid_or_unbounded_evidence'});
  const seen=new Map(), candidates=[], excluded=[];
  let unresolved=context.complete!==true;
  for(const r of records){
    if(!r||typeof r!=='object'||!id(r.id)||!id(r.mailboxId)||!email(r.from)||!Array.isArray(r.to)||!r.to.length||r.to.length>20||!r.to.every(email)||!plain(r.subject)||!instant(r.receivedAt)){unresolved=true;continue;}
    const safe={id:r.id,mailboxId:r.mailboxId,from:r.from.toLowerCase(),to:[...new Set(r.to.map(x=>x.toLowerCase()))].sort(),subject:normalized(r.subject),receivedAt:r.receivedAt,scanStatus:['clean','flagged','skipped'].includes(r.scanStatus)?r.scanStatus:'unknown',senderAuth:['pass','fail'].includes(r.senderAuth)?r.senderAuth:'unknown'};
    const fingerprint=JSON.stringify(safe);
    if(seen.has(r.id)){if(seen.get(r.id)!==fingerprint)unresolved=true;continue;}seen.set(r.id,fingerprint);
    if(Date.parse(r.receivedAt)>Date.parse(context.now)){unresolved=true;continue;}
    const domain=safe.from.slice(safe.from.lastIndexOf('@')+1);
    const senderMatches=cp.sender.type==='address'?safe.from===cp.sender.value:domain===cp.sender.value||domain.endsWith('.'+cp.sender.value);
    let reason= safe.mailboxId!==cp.mailboxId?'mailbox':!safe.to.includes(cp.recipient)?'recipient':!senderMatches?'sender':!cp.subjects.includes(safe.subject)?'subject':cp.baselineIds.includes(r.id)?'baseline':Date.parse(r.receivedAt)<Date.parse(cp.triggeredAt)?'pre_trigger':null;
    if(reason){excluded.push({id:r.id,reason});continue;} candidates.push(safe);
  }
  if(unresolved)return out('incomplete',candidates.map(r=>r.id),excluded,{reason:'coverage_or_metadata_unresolved'});
  if(!candidates.length)return out('pending',[],excluded);
  if(candidates.length>1)return out('ambiguous',candidates.map(r=>r.id),excluded);
  const selected=candidates[0];
  return out(selected.scanStatus==='flagged'?'quarantined':selected.scanStatus==='clean'?'candidate':'metadata_only',[selected.id],excluded,{scanStatus:selected.scanStatus,senderAuth:selected.senderAuth,freshness:'not_assessed',externalUseAuthorized:false});
}
