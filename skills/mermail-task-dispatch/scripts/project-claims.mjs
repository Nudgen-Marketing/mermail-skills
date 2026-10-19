// Pure projection of normalized non-secret metadata, never a mail reader,
// identity verifier, durable ledger writer or effect authorization mechanism.
const token=x=>typeof x==='string' && x.length>0 && x.length<=256 && !/[\u0000-\u001f\u007f]/.test(x);
function time(value) {
  if(typeof value!=='string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)) return NaN;
  const [y,m,d]=value.slice(0,10).split('-').map(Number), date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y || date.getUTCMonth()+1!==m || date.getUTCDate()!==d)return NaN;
  return Date.parse(value);
}
export function projectClaims(scope, events, clock) {
  const base={authorizesEffect:false,artifactVerified:false};
  if(!scope || scope.dispatchDelivered!==true || !['workspaceId','mailboxId','threadId','taskId','version','worker','recipient'].every(k=>token(scope[k])) ||
      !Number.isSafeInteger(scope.pollMax) || scope.pollMax<0 || scope.pollMax>12 ||
      !Number.isSafeInteger(scope.pollsUsed) || scope.pollsUsed<0 ||
      !Number.isSafeInteger(scope.checkinMax) || scope.checkinMax<0 ||
      !Number.isSafeInteger(scope.checkinsUsed) || scope.checkinsUsed<0 ||
      !Array.isArray(events) || events.length>8 || !Number.isFinite(time(clock)) ||
      !Number.isFinite(time(scope.dispatchAt)) || !Number.isFinite(time(scope.deadline)) ||
      time(scope.deadline)<time(scope.dispatchAt))return {...base,status:'uncertain',reason:'invalid_or_unbounded_scope'};
  const bound= time(clock)>=time(scope.deadline) || scope.pollsUsed>=scope.pollMax || scope.checkinsUsed>scope.checkinMax;
  const seen=new Map(),valid=[],rejected=[];
  for(const e of events) {
    if(!e || !token(e.id) || e.draft!==false || e.received!==true || e.scan!=='clean' || e.auth!=='pass' || e.contentOmitted!==false ||
        e.nativeHold!==false || !['workspaceId','mailboxId','threadId','taskId','version','worker','recipient'].every(k=>e[k]===scope[k]) ||
        !Number.isFinite(time(e.receivedAt)) || time(e.receivedAt)<time(scope.dispatchAt) ||
        time(e.receivedAt)>time(scope.deadline) || time(e.receivedAt)>time(clock) || !['ACK','STATUS','BLOCKED','RESULT'].includes(e.tag)) {
      rejected.push(token(e?.id)?e.id:'invalid'); continue;
    }
    const fingerprint=JSON.stringify([e.tag,e.resultStatus??null,e.artifactRef??null,e.receivedAt]);
    if(seen.has(e.id)) {if(seen.get(e.id)!==fingerprint)return {...base,status:'uncertain',reason:'conflicting_same_source',rejected};continue;}
    seen.set(e.id,fingerprint);valid.push(e);
  }
  valid.sort((a,b)=>time(a.receivedAt)-time(b.receivedAt) || a.id.localeCompare(b.id));
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++) {
    const a=valid[i],b=valid[j];
    if(time(a.receivedAt)===time(b.receivedAt) && a.tag!==b.tag &&
        [a.tag,b.tag].includes('BLOCKED') && [a.tag,b.tag].some(t=>t==='ACK'||t==='RESULT'))
      return {...base,status:'uncertain',reason:'conflicting_tied_states',rejected};
  }
  let status='dispatched', ack=false, result, ackMissing=false;
  for(const e of valid) {
    if(e.tag==='RESULT') {
      if(!['done','partial','blocked'].includes(e.resultStatus) || (e.resultStatus!=='blocked' && !token(e.artifactRef)))
        return {...base,status:'uncertain',reason:'incomplete_result',rejected};
      const value=JSON.stringify([e.resultStatus,e.artifactRef??null]);
      if(result && result!==value)return {...base,status:'uncertain',reason:'conflicting_results',rejected};
      result=value;ackMissing=!ack;status=e.resultStatus==='done'?'reported_done':e.resultStatus;
    } else if(!result) {
      if(e.tag==='ACK'){ack=true;status='acknowledged';}
      if(e.tag==='BLOCKED') status='blocked';
    }
  }
  if(bound && !result && status!=='blocked') status='expired';
  return {...base,status,ackMissing,evidence:valid.map(e=>e.id),rejected,
    trackingStopped:bound,remainingPolls:Math.max(0,scope.pollMax-scope.pollsUsed),
    remainingCheckins:Math.max(0,scope.checkinMax-scope.checkinsUsed),
    verificationHandoff:status==='reported_done'||status==='partial'?'owner_selection_required':'none'};
}
