// Offline projections over normalized, independently checked metadata. No mail,
// ledger, scheduler, authentication, reservation or delivery is performed here.
const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256 &&
  !/[\u0000-\u001f\u007f]/u.test(value);
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(result).toISOString() === value ? result : NaN;
};

export function projectManifest(scope, observations, previous = [], historyVerified = false) {
  const start = instant(scope?.start), end = instant(scope?.end);
  if (!identity(scope?.workspaceId) || !identity(scope?.mailboxId) || !Number.isFinite(start) ||
      !Number.isFinite(end) || start >= end || !Array.isArray(observations) ||
      observations.length > 200 || !Array.isArray(previous) || previous.length > 20)
    throw new Error('Invalid bounded manifest inputs');
  const unique = new Map();
  for (const item of observations) {
    if (!item || item.workspaceId !== scope.workspaceId || item.mailboxId !== scope.mailboxId ||
        !identity(item.id) || !Number.isFinite(instant(item.receivedAt))) throw new Error('Ambiguous source scope');
    const received = instant(item.receivedAt);
    if (received < start || received >= end) continue;
    const normalized = { id: item.id, digest: item.digest ?? null, scan: item.scan,
      safeBodyRead: item.safeBodyRead === true, keep: item.keep === true,
      topics: [...new Set(Array.isArray(item.topics) ? item.topics : [])].sort(), receivedAt: item.receivedAt };
    if (normalized.topics.length > 7 || normalized.topics.some(t => !identity(t)))
      throw new Error('Invalid bounded topic set');
    if (unique.has(item.id) && JSON.stringify(unique.get(item.id)) !== JSON.stringify(normalized))
      throw new Error('Conflicting observations of one source');
    unique.set(item.id, normalized);
  }
  const delivered = new Map();
  if (historyVerified === true) for (const record of previous) {
    if (!record || record.workspaceId !== scope.workspaceId || record.mailboxId !== scope.mailboxId)
      throw new Error('Ambiguous prior manifest scope');
    if (record.status !== 'sent' || record.authoritativeDelivery !== true) continue;
    if (!Array.isArray(record.sources) || record.sources.length > 200) throw new Error('Invalid prior sources');
    for (const source of record.sources) {
      if (!identity(source?.id) || !version(source.digest)) throw new Error('Invalid delivered source identity');
      if (!delivered.has(source.id)) delivered.set(source.id, new Set());
      delivered.get(source.id).add(source.digest);
    }
  }
  const counts = { observedRows: observations.length, uniqueCandidates: unique.size,
    safelyRead: 0, kept: 0, dropped: 0, metadataOnly: 0, alreadyDelivered: 0,
    revisedSources: 0, noveltyUnknown: 0 };
  const included = [], topicMembers = new Map();
  for (const item of unique.values()) {
    if (item.scan !== 'clean' || !item.safeBodyRead || !version(item.digest)) {
      counts.metadataOnly++;
      continue;
    }
    counts.safelyRead++;
    if (!item.keep) { counts.dropped++; continue; }
    if (historyVerified && delivered.get(item.id)?.has(item.digest)) {
      counts.alreadyDelivered++;
      continue;
    }
    if (!historyVerified) counts.noveltyUnknown++;
    else if (delivered.has(item.id)) counts.revisedSources++;
    counts.kept++;
    included.push({ id: item.id, digest: item.digest });
    for (const topic of item.topics) {
      if (!topicMembers.has(topic)) topicMembers.set(topic, new Set());
      topicMembers.get(topic).add(item.id);
    }
  }
  if (topicMembers.size > 7) throw new Error('Digest exceeds seven theme groups');
  return { counts, included: included.sort((a, b) => a.id.localeCompare(b.id)),
    topicCounts: Object.fromEntries([...topicMembers].sort(([a], [b]) => a.localeCompare(b)).map(([topic, ids]) => [topic, ids.size])),
    authorizesEffect: false, provesCompleteCoverage: false };
}

export function planDelivery(input) {
  const hold = state => ({ state, authorizesEffect: false, walletAllowed: false });
  if (input?.kind === 'read') return hold('report_only');
  if (input?.kind === 'recurring') return hold('scheduler_required');
  if (input?.kind === 'paid_report') return hold('merchant_integration_required');
  if (!['draft', 'send', 'schedule'].includes(input?.kind)) return hold('blocked');
  if (input.coordinationVerified !== true || input.intentState !== 'fresh' ||
      input.recipientConfirmed !== true || input.audienceAccessConfirmed !== true ||
      !version(input.currentPayloadHash) || input.currentPayloadHash !== input.reviewedPayloadHash)
    return hold('manual_reconciliation_required');
  if (input.kind !== 'draft' && input.operatorApproved !== true) return hold('approval_required');
  if (input.kind === 'schedule') {
    const now = instant(input.now), when = instant(input.scheduledAt);
    if (!Number.isFinite(now) || !Number.isFinite(when) || when <= now) return hold('invalid_one_time_schedule');
  }
  return { ...hold('ready_for_owner_reservation'), requiresActualAtomicReservation: true };
}
