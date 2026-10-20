import {pathToFileURL} from 'node:url';

const scale = 1000000n;
const digits = {USD:2, EUR:2, GBP:2, JPY:0, VND:0};
const scopeKeys = ['workspaceId','mailboxId','vendor','sessionId'];
function required(ok, reason) { if (!ok) throw new Error(reason); }
function text(v) { return typeof v === 'string' && v.length > 0 && v.length <= 254 && !/[\r\n\0]/.test(v); }
function money(v) {
  required(typeof v === 'string' && /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(v), 'invalid_money');
  const [a,b=''] = v.split('.'); return BigInt(a)*scale + BigInt(b.padEnd(6,'0'));
}
function decimal(n) { const a=n/scale,b=(n%scale).toString().padStart(6,'0').replace(/0+$/,''); return a.toString()+(b?'.'+b:''); }
function sameScope(a,b) { return scopeKeys.every(k=>a[k]===b[k]); }
function timestamp(v) { return typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v; }

// Pure review only. Caller supplies normalized owner facts and native evidence;
// this cannot authenticate input, reserve a logical send, persist or dispatch.
export function preview(input) {
  try {
    required(input && typeof input === 'object', 'invalid_input');
    const c=input.constraints;
    required(c && scopeKeys.every(k=>text(c[k])), 'missing_scope');
    required(timestamp(c.now), 'invalid_current_time');
    const usage=c.readUsage;
    required(usage && Object.entries({calls:12,metadataMessages:200,bodyMessages:8,bodyChars:50000}).every(([k,max])=>Number.isSafeInteger(usage[k]) && usage[k]>=0 && usage[k]<=max), 'read_budget_exceeded_or_unknown');
    required(Object.hasOwn(digits,c.currency), 'unsupported_currency');
    required(Number.isSafeInteger(c.quantity) && c.quantity>0 && c.quantity<=1000000000, 'invalid_quantity');
    required(['unit','total'].includes(c.capBasis), 'ambiguous_cap_basis');
    const cap=money(c.cap); required(cap>0n,'invalid_cap');
    required(Number.isSafeInteger(c.maxRounds) && c.maxRounds>0 && c.maxRounds<=20, 'invalid_round_budget');
    required(Number.isSafeInteger(c.sentRounds) && c.sentRounds>=0 && c.sentRounds<=c.maxRounds, 'invalid_sent_rounds');
    required(['none','sent','pending','unknown'].includes(c.priorIntent), 'unresolved_prior_intent');
    required(c.baselineComplete===true && Array.isArray(c.baselineIds) && c.baselineIds.length<=200 && c.baselineIds.every(text), 'incomplete_baseline');
    required(new Set(c.baselineIds).size===c.baselineIds.length, 'duplicate_baseline');
    const seen=c.seen ?? [];
    required(Array.isArray(seen) && seen.length<=200 && seen.every(s=>s && text(s.messageId) && typeof s.digest==='string' && /^[a-f0-9]{64}$/.test(s.digest)), 'invalid_seen_manifest');
    required(new Set(seen.map(s=>s.messageId)).size===seen.length, 'conflicting_seen_manifest');
    required(['none','sent'].includes(c.priorIntent), 'unresolved_prior_intent');
    required(c.sentRounds===0 ? c.priorIntent==='none' : c.priorIntent==='sent', 'inconsistent_prior_intent');
    required(c.sentRounds<c.maxRounds, 'round_budget_exhausted');
    const totalCap=c.capBasis==='total'?cap:cap*BigInt(c.quantity);
    const o=input.offer;
    if (!o) {
      required(c.sentRounds===0 && !c.boundThreadId, 'missing_current_offer');
      return {status:'opening_draft_only',currency:c.currency,quantity:c.quantity,capBasis:c.capBasis,totalCap:decimal(totalCap),sendAuthorized:false};
    }
    required(sameScope(c,o), 'scope_mismatch');
    required(c.sentRounds>0 && text(c.boundThreadId) && o.threadId===c.boundThreadId, 'thread_mismatch');
    required(timestamp(c.dispatchedAt) && timestamp(o.receivedAt) && Date.parse(o.receivedAt)>Date.parse(c.dispatchedAt) && Date.parse(o.receivedAt)<=Date.parse(c.now), 'offer_outside_dispatched_window');
    required(text(o.messageId) && typeof o.digest==='string' && /^[a-f0-9]{64}$/.test(o.digest), 'missing_source_version');
    required(!c.baselineIds.includes(o.messageId), 'baseline_offer');
    const previous=seen.find(s=>s.messageId===o.messageId);
    required(!previous, previous?.digest===o.digest?'duplicate_offer':'conflicting_offer_version');
    required(o.reviewedRound===c.sentRounds+1, 'stale_or_future_reviewed_round');
    required(o.scanStatus==='clean' && o.senderAuthentication==='pass' && o.nativeHold===false && o.truncated===false && o.contentOmitted===false && o.agentSafeContent===true, 'unsafe_or_incomplete_evidence');
    required(o.authoredOnly===true && Number.isSafeInteger(o.bodyChars) && o.bodyChars>0 && o.bodyChars<=10000 && usage.bodyChars>=o.bodyChars && usage.bodyMessages>=1, 'unbounded_or_quoted_offer');
    required(o.currency===c.currency && o.quantity===c.quantity, 'changed_currency_or_quantity');
    required(o.costsComplete===true && o.termsComplete===true, 'unresolved_material_terms');
    const unit=money(o.unitPrice), extras=money(o.extrasTotal);
    const total=unit*BigInt(c.quantity)+extras;
    const minorDivisor=10n**BigInt(6-digits[c.currency]);
    required(total%minorDivisor===0n, 'nonrepresentable_currency_total');
    const within=total<=totalCap && (c.capBasis!=='unit'||unit<=cap);
    return {status:within?'price_eligible_not_accepted':'counter_or_clarify',currency:c.currency,quantity:c.quantity,unitPrice:decimal(unit),extrasTotal:decimal(extras),total:decimal(total),totalMinor:(total/minorDivisor).toString(),totalCap:decimal(totalCap),sourceMessageId:o.messageId,reviewedRound:o.reviewedRound,sendAuthorized:false};
  } catch (e) { return {status:'hold',reason:e.message,sendAuthorized:false}; }
}

export function audit(input) {
  required(input?.ownerRequested===true && input.destination==='local_private', 'private_audit_not_authorized');
  const result=preview(input);
  const c=input.constraints;
  required(result.status!=='hold' || (['round_budget_exhausted','unresolved_prior_intent'].includes(result.reason) && c && ['pending','unknown','sent'].includes(c.priorIntent) && Array.isArray(c.baselineIds) && Array.isArray(c.seen??[])), 'audit_requires_valid_scoped_preview');
  if(input.offer) required(sameScope(c,input.offer) && text(c.boundThreadId) && input.offer.threadId===c.boundThreadId && text(input.offer.messageId) && typeof input.offer.digest==='string' && /^[a-f0-9]{64}$/.test(input.offer.digest), 'audit_scope_mismatch');
  return {kind:'private_local_audit_preview',scope:Object.fromEntries(scopeKeys.map(k=>[k,c[k]])),constraints:{currency:c.currency,quantity:c.quantity,cap:c.cap,capBasis:c.capBasis,maxRounds:c.maxRounds,sentRounds:c.sentRounds,priorIntent:c.priorIntent},evidence:{baselineIds:[...c.baselineIds],seen:(c.seen??[]).map(s=>({messageId:s.messageId,digest:s.digest})),sourceMessageId:input.offer?.messageId??null,sourceDigest:input.offer?.digest??null},review:result,fileWritten:false,delivered:false};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    let raw=''; for await (const chunk of process.stdin) { raw+=chunk; required(Buffer.byteLength(raw)<=1048576,'input_too_large'); }
    const input=JSON.parse(raw); required(['preview','audit'].includes(input.action),'invalid_action');
    const output=input.action==='audit'?audit(input):preview(input);
    console.log(JSON.stringify(output)); if(output.status==='hold')process.exitCode=2;
  } catch(e) { console.log(JSON.stringify({status:'hold',reason:e.message,sendAuthorized:false})); process.exitCode=2; }
}
