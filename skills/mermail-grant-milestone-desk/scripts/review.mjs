// Offline projections of already normalized owner/evidence inputs only.
// No network, evidence verification, storage, reservation or effect authority.
const identifier=x=>typeof x==='string' && x.trim()===x && x.length>0 && x.length<=256 && !/[\u0000-\u001f\u007f]/.test(x);
const decimal=x=>typeof x==='string' && x.length<=100 && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(x);
const sourceKeys=['workspaceId','mailboxId','emailId','threadId','granteeId','agreementId','agreementRevision','milestoneId','milestoneVersion'];
const base={authorizesPayment:false,authorizesSend:false,actuallyVerified:false,actuallyReserved:false};
function timestamp(value) {
  if(typeof value!=='string' || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9])$/.test(value))return NaN;
  const date=new Date(value.slice(0,10)+'T00:00:00Z');
  if(!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10)!==value.slice(0,10))return NaN;
  return Date.parse(value);
}
function units(value,decimals) {
  if(!decimal(value) || !Number.isSafeInteger(decimals) || decimals<0 || decimals>36)throw Error('invalid_exact_decimal');
  const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw Error('excess_precision');
  return BigInt(whole+fraction.padEnd(decimals,'0'));
}
export function reviewCriteria(selected,submission,agreement,observations) {
  const hold=reason=>({...base,status:'review_required',reason});
  if(!selected || !submission || !sourceKeys.every(k=>identifier(selected[k]) && selected[k]===submission[k]))return hold('source_scope_mismatch');
  if(submission.scan!=='clean' || submission.auth!=='pass' || submission.safeContent!==true ||
      submission.nativeHold!==false || submission.contentOmitted!==false || submission.truncated!==false ||
      submission.authoredSeparated!==true || !Number.isSafeInteger(submission.bodyChars) || submission.bodyChars<0 || submission.bodyChars>10000)
    return hold('native_intake_unverified');
  if(!agreement || agreement.ownerConfirmed!==true || !['grant','bounty','contractor'].includes(agreement.kind) ||
      !['workspaceId','mailboxId','agreementId','agreementRevision','granteeId','milestoneId','milestoneVersion'].every(k=>agreement[k]===selected[k]) ||
      !identifier(agreement.legalPayer) || !identifier(agreement.acceptanceAuthority) ||
      !Array.isArray(agreement.criteria) || agreement.criteria.length<1 || agreement.criteria.length>20 ||
      !Array.isArray(observations) || observations.length>40)return hold('agreement_or_observation_scope_missing');
  const seenCriteria=new Set(),seenObservations=new Set(),rows=[];
  for(const criterion of agreement.criteria) {
    if(!criterion || !['id','owner','target','version'].every(k=>identifier(criterion[k])) || seenCriteria.has(criterion.id))return hold('ambiguous_agreement_criterion');
    seenCriteria.add(criterion.id);
    const candidates=observations.filter(o=>o?.criterionId===criterion.id);
    if(candidates.length!==1){rows.push({criterionId:criterion.id,result:candidates.length?'conflict':'missing'});continue;}
    const o=candidates[0];
    if(!identifier(o.evidenceId) || seenObservations.has(o.evidenceId))return hold('ambiguous_evidence_identity');
    seenObservations.add(o.evidenceId);
    if(o.selectedOwner!==true || o.owner!==criterion.owner || o.target!==criterion.target || o.version!==criterion.version ||
        !Number.isFinite(timestamp(o.observedAt)) || o.independentProvenance!==true ||
        (criterion.observedAfter!==undefined && (!Number.isFinite(timestamp(criterion.observedAfter)) || timestamp(o.observedAt)<timestamp(criterion.observedAfter))) ||
        (criterion.observedBefore!==undefined && (!Number.isFinite(timestamp(criterion.observedBefore)) || timestamp(o.observedAt)>timestamp(criterion.observedBefore))))
      {rows.push({criterionId:criterion.id,result:'unverified'});continue;}
    rows.push({criterionId:criterion.id,result:['pass','fail','partial'].includes(o.result)?o.result:'unverified',evidenceId:o.evidenceId});
  }
  if(observations.some(o=>!o || !seenCriteria.has(o.criterionId)))return hold('unscoped_observation');
  const complete=rows.every(row=>row.result==='pass');
  const acceptance=agreement.acceptance;
  const accepted=acceptance?.ownerConfirmed===true && acceptance.authority===agreement.acceptanceAuthority &&
    ['workspaceId','mailboxId','agreementId','agreementRevision','granteeId','milestoneId','milestoneVersion'].every(k=>acceptance[k]===selected[k]) &&
    acceptance.legalPayer===agreement.legalPayer &&
    identifier(acceptance.evidenceId) && acceptance.result==='accepted';
  return {...base,status:complete?(accepted?'normalized_acceptance_matches':'acceptance_review_required'):'revision_required',rows,
    next:'actual_owner_verification_and_acceptance_provenance_review',financialEffectAllowed:false};
}
export function projectBudget(policy,entries) {
  const hold=reason=>({...base,status:'manual_payment_review',reason});
  const group=['legalPayer','agreementId','network','assetIdentity','windowId'];
  if(!policy || policy.ownerConfirmed!==true || policy.historyComplete!==true || policy.currentMilestoneAlreadyReserved!==false ||
      !group.every(k=>identifier(policy[k])) || !identifier(policy.revision) ||
      !Array.isArray(entries) || entries.length>200)return hold('incomplete_budget_scope');
  try {
    const amount=units(policy.amount,policy.decimals),milestone=units(policy.milestoneCap,policy.decimals),cap=units(policy.budgetCap,policy.decimals);
    if(amount<=0n || milestone<=0n || cap<=0n || amount>milestone)return hold('invalid_or_excess_tranche');
    const seen=new Set();let committed=0n;
    for(const row of entries) {
      if(!row || !group.every(k=>row[k]===policy[k]) || !identifier(row.intentId) || seen.has(row.intentId))return hold('ambiguous_commitment_scope');
      seen.add(row.intentId);
      if(!['settled','reserved','attempting','pending','unknown','released_definitively'].includes(row.status))return hold('unknown_commitment_status');
      const value=units(row.amount,policy.decimals);
      if(row.status==='released_definitively'){if(row.authoritativeRelease!==true)return hold('release_not_proven');}
      else committed+=value;
    }
    if(committed+amount>cap)return hold('budget_exceeded');
    return {...base,status:'within_declared_arithmetic_caps',amountBaseUnits:amount.toString(),committedBaseUnits:committed.toString(),
      remainingAfterBaseUnits:(cap-committed-amount).toString(),requiresActualAtomicMilestoneAndBudgetReservation:true,
      next:'manual_handoff_until_real_coordination_and_fresh_approval'};
  } catch {return hold('invalid_exact_amount');}
}
