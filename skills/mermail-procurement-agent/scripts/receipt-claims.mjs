// Pure offline comparison of normalized, non-secret receipt claims.
// Inputs do not become trusted proof; this helper never authorizes an effect.
const fields=['amount_base','asset','chain','payee','plan','period','purchase_reference'];
const valid=s=>typeof s==='string' && s.length>0 && s.length<=256 && !/[\u0000-\u001f\u007f]/.test(s);
const uint=s=>typeof s==='string' && /^(0|[1-9][0-9]{0,99})$/.test(s);
export function paymentScope(scope, profile) {
  if(!['not_requested','not_required','requested','external_checkout'].includes(scope)) throw Error('Unknown payment scope');
  if(!['api_key','agent_inbox','oauth_full'].includes(profile)) throw Error('Unknown profile');
  return {wallet_probe:scope==='requested' && profile==='oauth_full',payment_handoff:scope==='requested' && profile!=='oauth_full',authorization:'none'};
}
export function compareReceiptClaims(expected, claims) {
  const base={authorization:'none',settlement_verified:false};
  if(!expected || !fields.every(k=>valid(expected[k])) || !uint(expected.amount_base) ||
      !Array.isArray(claims) || claims.length>5) return {...base,verdict:'malformed'};
  if(!claims.length) return {...base,verdict:'pending',unique_claims:0,evidence_incomplete:true};
  const seen=new Map(), mismatches=new Set(), distinctValues=new Set();
  let incomplete=false;
  for(const c of claims) {
    // An unread/invalid source is a coverage gap, not permission to erase a
    // conflict already established by another usable clean source.
    if(!c || c.scan_status!=='clean' || c.native_hold!==false) {incomplete=true;continue;}
    if(!valid(c.source_id) || !fields.every(k=>valid(c[k])) || !uint(c.amount_base)) {incomplete=true;continue;}
    const values=fields.map(k=>c[k]);
    const serialized=JSON.stringify(values);
    if(seen.has(c.source_id) && seen.get(c.source_id)!==serialized) mismatches.add('source_conflict');
    seen.set(c.source_id,serialized);
    distinctValues.add(serialized);
    for(const k of fields) if(c[k]!==expected[k]) mismatches.add(k);
  }
  return {...base,verdict:mismatches.size?'mismatch':incomplete?'pending':'claims_consistent',
    unique_claims:distinctValues.size,mismatches:[...mismatches].sort(),evidence_incomplete:incomplete};
}
