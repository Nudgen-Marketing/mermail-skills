// Offline projection of source-linked observations, not an NLP extractor,
// safety/auth verifier, persistent task system or effect authorization.
const str = (s, max=160) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(s);
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : NaN;
};
const safe = m => m.scanStatus === 'clean' && m.safeContent === true && m.nativeHold === false && m.contentOmitted === false &&
  m.truncated === false && m.authoredSeparated === true && Number.isInteger(m.bodyChars) && m.bodyChars >= 0 && m.bodyChars <= 6000;

export function projectTasks(scope, messages, observations) {
  if (!scope || !str(scope.workspaceId) || !str(scope.mailboxId) || !Number.isFinite(instant(scope.now)) ||
      typeof scope.coverageComplete !== 'boolean' || typeof scope.sentReviewed !== 'boolean' ||
      !Array.isArray(messages) || messages.length > 20 || !Array.isArray(observations) || observations.length > 100 ||
      !Number.isInteger(scope.staleDays) || scope.staleDays < 1 || scope.staleDays > 365)
    throw Error('Explicit bounded scope, coverage and elapsed-day threshold required');
  const byId = new Map(), fingerprints = new Map(), threadCounts = new Map();
  for (const m of messages) {
    if (!m || m.workspaceId !== scope.workspaceId || m.mailboxId !== scope.mailboxId ||
        !str(m.id) || !str(m.threadId) || !Number.isFinite(instant(m.at)) ||
        instant(m.at) > instant(scope.now) || !['inbound','outbound'].includes(m.direction))
      throw Error('Invalid message identity, timestamp or selected scope');
    const fingerprint = JSON.stringify(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)));
    if (byId.has(m.id)) {
      if (fingerprints.get(m.id) !== fingerprint) throw Error('Conflicting immutable message observations');
      continue;
    }
    byId.set(m.id,m); fingerprints.set(m.id,fingerprint);
    threadCounts.set(m.threadId,(threadCounts.get(m.threadId)||0)+1);
  }
  if (threadCounts.size > 5 || [...threadCounts.values()].some(n=>n>10)) throw Error('Thread budget exceeded');
  const grouped = new Map();
  for (const o of observations) {
    if (!o || !str(o.actionId) || !str(o.messageId) || !byId.has(o.messageId)) throw Error('Source-linked action identity required');
    const m=byId.get(o.messageId), key=JSON.stringify([m.threadId,o.actionId]);
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(o);
  }
  const tasks=[];
  for (const [key, copies] of grouped) {
    const o=copies[0], m=byId.get(o.messageId);
    const base={actionId:o.actionId,threadId:m.threadId,workspaceId:scope.workspaceId,mailboxId:scope.mailboxId,
      sourceIds:[...new Set(copies.map(x=>x.messageId))]};
    if (copies.some(x=>!safe(byId.get(x.messageId)) || x.quoted!==false)) {
      tasks.push({...base,class:'blocked',reason:'unsafe_incomplete_or_quoted_source',priority:'P3',priorityBasis:'metadata_only',authorization:'none'}); continue;
    }
    if (new Set(copies.map(x=>JSON.stringify(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))).size>1) {
      const conflictingObservations=copies.map(x=>({sourceId:x.messageId,title:str(x.title,120)?x.title:null,
        dueAt:Number.isFinite(instant(x.dueAt))?x.dueAt:null,dueHint:str(x.dueHint,120)?x.dueHint:null,
        status:['open','fulfilled','cancelled'].includes(x.status)?x.status:'unknown',
        assignee:['owner','other','unknown'].includes(x.ownerRole)?x.ownerRole:'unknown'}));
      tasks.push({...base,class:'needs_clarification',reason:'conflicting_action_observations',conflictingObservations,
        priority:'P2',priorityBasis:'review_conflicting_evidence',authorization:'none'}); continue;
    }
    if (!str(o.title,120) || !['owner','other','unknown'].includes(o.ownerRole) ||
        !['request','promise','fyi'].includes(o.kind) || !['open','fulfilled','cancelled'].includes(o.status) ||
        !['high','medium','low'].includes(o.confidence)) throw Error('Invalid extracted observation');
    let classification='needs_clarification', reason='unknown_assignee';
    const sourceIds=[o.messageId];
    if (o.kind==='fyi') { classification='fyi_no_action'; reason='no_evidenced_ask'; }
    else if (o.ownerRole==='owner') { classification='i_owe'; reason='evidenced_owner_obligation'; }
    else if (o.ownerRole==='other') { classification='waiting_on_others'; reason='open_in_reviewed_scope'; }
    let last=m;
    if (o.lastRelevantMessageId) {
      const reply=byId.get(o.lastRelevantMessageId);
      if (!reply || reply.threadId!==m.threadId || !safe(reply) || instant(reply.at)<instant(m.at))
        throw Error('Invalid last relevant evidence');
      last=reply; sourceIds.push(reply.id);
    }
    const provisional=!scope.coverageComplete || !scope.sentReviewed;
    if (o.status!=='open') {
      const resolution=byId.get(o.resolutionMessageId);
      if (o.resolutionExplicit!==true || !resolution || resolution.threadId!==m.threadId ||
          !safe(resolution) || instant(resolution.at)<instant(m.at) || provisional) {
        classification='needs_clarification'; reason='resolution_not_established';
      } else { classification='resolved_in_reviewed_scope'; reason=o.status; sourceIds.push(resolution.id); }
    } else if (classification==='waiting_on_others' && !provisional && m.direction==='outbound' &&
               o.kind==='request' && Math.floor((instant(scope.now)-instant(last.at))/86400000)>=scope.staleDays) {
      classification='stale_followup'; reason='elapsed_threshold_in_reviewed_scope';
    }
    let priority='P2', priorityBasis='undated_or_later_action', dueAt=null;
    if (o.dueAt != null) {
      if (!Number.isFinite(instant(o.dueAt))) throw Error('Resolved deadline must be an explicit UTC timestamp');
      dueAt=o.dueAt; const remaining=instant(dueAt)-instant(scope.now);
      if (remaining<=48*3600000) {priority='P0';priorityBasis=remaining<0?'evidenced_overdue':'evidenced_within_48h';}
      else if (remaining<=7*86400000) {priority='P1';priorityBasis='evidenced_within_rolling_7d';}
    }
    if (o.dueHint != null && !str(o.dueHint,120)) throw Error('Invalid literal due hint');
    if (['resolved_in_reviewed_scope','fyi_no_action'].includes(classification)) {
      priority='P3';priorityBasis='non_actionable_history';
    } else if (classification==='needs_clarification') {
      priority='P2';priorityBasis='review_evidence_before_action';
    }
    tasks.push({...base,sourceIds:[...new Set(sourceIds)],title:o.title,assignee:o.ownerRole,
      class:classification,reason,priority,priorityBasis,dueAt,dueHint:o.dueHint??'Not specified in the email',
      confidence:o.confidence,provisional,authorization:'none'});
  }
  tasks.sort((a,b)=>(a.priority??'P3').localeCompare(b.priority??'P3')||a.threadId.localeCompare(b.threadId)||a.actionId.localeCompare(b.actionId));
  return {authorization:'none',scope:{workspaceId:scope.workspaceId,mailboxId:scope.mailboxId},
    reviewedMessages:byId.size,coverageComplete:scope.coverageComplete,sentReviewed:scope.sentReviewed,
    extractedTasks:tasks,counts:tasks.reduce((all,t)=>(all[t.class]=(all[t.class]||0)+1,all),{})};
}
