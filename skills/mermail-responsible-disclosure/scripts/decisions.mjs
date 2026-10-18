// Offline projections only. Inputs are already normalized by the human-led workflow.
// No network, persistence, evidence validation or effect authorization is performed.
export function chooseCommunication(input) {
  const missing = Array.isArray(input.missingFields) ? [...new Set(input.missingFields)] : [];
  const blocked = input.scanStatus !== 'clean' || input.safeInterpretation !== true;
  const humanReview = blocked || input.sensitive === true || input.highImpact === true ||
    input.extortion === true || input.policyAmbiguous === true;
  const common = { missingFields: missing, walletAllowed: false, authorizesEffect: false };
  if (humanReview) return { ...common, outcome: input.ownerRecipientSelected === true ?
    'escalation_proposed' : 'owner_review_required', metadataOnly: blocked };
  if (missing.length) return { ...common, outcome: 'clarification_proposed', metadataOnly: false };
  return { ...common, outcome: input.acknowledgmentRequested === true ?
    'acknowledgment_proposed' : 'packet_only', metadataOnly: false };
}

export function toBaseUnits(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 ||
      typeof value !== 'string' || value.length > 128 ||
      !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('Invalid exact decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('Excess precision');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

// Arithmetic review for one asset/network/window only; caller must supply verified
// complete ledger state. This function is deliberately NOT an atomic reservation.
export function assessCap(input) {
  const hold = reason => ({ status: 'manual_review', reason, authorizesEffect: false });
  if (input.ledgerComplete !== true || input.atomicReservationAvailable !== true)
    return hold('enforceable_coordination_unavailable');
  if (input.caseAlreadyReserved !== false) return hold('case_reserved_or_unknown');
  const group = [input.assetIdentity, input.network, input.windowId];
  if (group.some(x => typeof x !== 'string' || !x.trim())) return hold('ambiguous_scope');
  if (!Array.isArray(input.entries) || input.entries.length > 200) return hold('incomplete_or_oversize_ledger');
  try {
    const award = toBaseUnits(input.award, input.decimals);
    const single = toBaseUnits(input.perAwardCap, input.decimals);
    const total = toBaseUnits(input.windowCap, input.decimals);
    if (award <= 0n || award > single) return hold('award_cap_exceeded_or_zero');
    let used = 0n;
    const seen = new Set();
    for (const row of input.entries) {
      if (!row || row.assetIdentity !== group[0] || row.network !== group[1] ||
          row.windowId !== group[2] || typeof row.intentId !== 'string' ||
          !row.intentId.trim() || seen.has(row.intentId.trim())) return hold('ambiguous_ledger_entry');
      seen.add(row.intentId.trim());
      if (!['settled', 'reserved', 'pending', 'unknown', 'released_definitively'].includes(row.status))
        return hold('unknown_ledger_status');
      const amount = toBaseUnits(row.amount, input.decimals);
      if (row.status === 'released_definitively' && row.authoritativeRelease !== true)
        return hold('unverified_release');
      if (row.status !== 'released_definitively') used += amount;
    }
    if (used + award > total) return hold('window_cap_exceeded');
    return { status: 'within_arithmetic_caps', usedBaseUnits: used.toString(),
      awardBaseUnits: award.toString(), remainingAfterAwardBaseUnits: (total - used - award).toString(),
      requiresActualAtomicReservation: true, authorizesEffect: false };
  } catch { return hold('invalid_exact_amount'); }
}
