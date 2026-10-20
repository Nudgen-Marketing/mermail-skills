// Bounded offline projections, adapted from collinschizaram1-ctrl PR #159.
// No mail, wallet, browser, persistence or effect authorization is performed.
import { readFile, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const DAY = 86400000, SCALE = 10n ** 18n;
const safe = x => typeof x === 'string' && x.length > 0 && x.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(x);
function scopeKey(scope) {
  if (!scope || !safe(scope.workspaceId) || !safe(scope.mailboxId)) throw Error('Explicit workspace/mailbox required');
  dateDay(scope.asOf);
  return scope;
}
function dateDay(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d\d-\d\d$/.test(value)) throw Error('Explicit charge date required');
  const time = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw Error('Invalid charge date');
  return time / DAY;
}
function money(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,63})(?:\.\d{1,18})?$/.test(value)) throw Error('Exact nonnegative decimal required');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'));
}
const decimal = units => {
  const fraction = (units % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return `${units / SCALE}${fraction ? '.' + fraction : ''}`;
};
function bounded(records) {
  if (!Array.isArray(records) || records.length > 200 || records.some(x => !x || typeof x !== 'object' || Array.isArray(x)))
    throw Error('Expected at most 200 reviewed rows');
  return records;
}
function selected(scope, row) {
  if (row.workspaceId !== scope.workspaceId || row.mailboxId !== scope.mailboxId) throw Error('Out-of-scope evidence');
  for (const field of ['sourceId', 'vendorId', 'accountId', 'planId']) if (!safe(row[field])) throw Error('Missing evidence identity');
  if (!/^[A-Z]{3,8}$/.test(row.currency ?? '')) throw Error('Explicit currency required');
}
function clean(row) {
  return row.scanStatus === 'clean' && row.contentOmitted === false && row.senderAuthentication === 'pass'
    && row.nativeHold === false && row.truncated === false && row.safeContent === true;
}
const key = row => JSON.stringify([row.vendorId, row.accountId, row.planId, row.currency]);
const sources = rows => [...new Set(rows.flatMap(x => x.sourceIds ?? [x.sourceId]))].sort();
const nonAuthorizing = scope => ({ workspaceId: scope.workspaceId, mailboxId: scope.mailboxId, authorizesEffect: false, settlementVerified: false });

export function detectPatterns(scope, records) {
  scopeKey(scope);
  const seenSources = new Map(), events = new Map(), review = [];
  for (const row of bounded(records)) {
    selected(scope, row);
    const observation = JSON.stringify([row.vendorId, row.accountId, row.planId, row.currency,
      row.eventId, row.chargeDate, row.amount, row.direction, row.documentKind, row.dateEvidence,
      row.scanStatus, row.contentOmitted, row.senderAuthentication, row.nativeHold, row.truncated, row.safeContent]);
    if (seenSources.has(row.sourceId)) {
      if (seenSources.get(row.sourceId) !== observation) throw Error('Conflicting immutable-source observation');
      continue;
    }
    seenSources.set(row.sourceId, observation);
    if (!clean(row)) { review.push({ sourceId: row.sourceId, reason: 'metadata_only_or_auth_unknown' }); continue; }
    if (row.direction !== 'charge' || !['receipt', 'payment_confirmation'].includes(row.documentKind) || row.dateEvidence !== 'stated') {
      review.push({ sourceId: row.sourceId, reason: 'not_explicit_historical_charge' }); continue;
    }
    if (!safe(row.eventId)) { review.push({ sourceId: row.sourceId, reason: 'stable_event_id_missing' }); continue; }
    let time, amount;
    try { time = dateDay(row.chargeDate); amount = money(row.amount); }
    catch { review.push({ sourceId: row.sourceId, reason: 'amount_or_date_needs_review' }); continue; }
    if (amount === 0n) { review.push({ sourceId: row.sourceId, reason: 'zero_is_not_recurring_charge' }); continue; }
    if (time > dateDay(scope.asOf)) { review.push({ sourceId: row.sourceId, reason: 'future_charge_claim' }); continue; }
    const eventKey = JSON.stringify([key(row), row.eventId]);
    const prior = events.get(eventKey);
    if (prior && (prior.time !== time || prior.amount !== amount)) throw Error('Conflicting copies of one charge event');
    if (prior) prior.sourceIds.push(row.sourceId);
    else events.set(eventKey, { ...row, time, amount, sourceIds: [row.sourceId] });
  }
  const groups = new Map();
  for (const event of events.values()) {
    const groupKey = JSON.stringify([key(event), event.amount.toString()]);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(event);
  }
  const patterns = [], oneOffs = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.time - b.time || a.eventId.localeCompare(b.eventId));
    if (group.length < 2) { oneOffs.push({ sourceIds: sources(group), reason: 'one_event_only' }); continue; }
    const gaps = group.slice(1).map((x, i) => x.time - group[i].time);
    if (gaps.some(gap => gap <= 0)) { review.push({ sourceIds: sources(group), reason: 'same_day_events_not_cadence' }); continue; }
    const bucket = [['weekly', 6, 8], ['biweekly', 12, 16], ['monthly', 26, 35], ['quarterly', 80, 100], ['annual', 350, 380]]
      .find(([, low, high]) => gaps.every(gap => gap >= low && gap <= high));
    const last = group.at(-1), min = Math.min(...gaps), max = Math.max(...gaps);
    patterns.push({ vendorId: last.vendorId, accountId: last.accountId, planId: last.planId,
      currency: last.currency, amount: decimal(last.amount), distinctEvents: group.length,
      cadenceCandidate: bucket?.[0] ?? 'irregular_review_only', confidence: group.length >= 3 && bucket ? 'candidate_not_confirmed' : 'weak_candidate',
      sourceIds: sources(group), eventIds: group.map(x => x.eventId), firstChargeDate: group[0].chargeDate,
      lastChargeDate: last.chargeDate, estimatedNextRange: bucket ? {
        from: new Date((last.time + min) * DAY).toISOString().slice(0, 10),
        through: new Date((last.time + max) * DAY).toISOString().slice(0, 10),
        basis: 'observed_gap_projection_not_vendor_date_or_cancellation_cutoff' } : null });
  }
  patterns.sort((a, b) => JSON.stringify([a.vendorId, a.accountId, a.planId, a.currency, a.amount]).localeCompare(JSON.stringify([b.vendorId, b.accountId, b.planId, b.currency, b.amount])));
  return { ...nonAuthorizing(scope), patterns, oneOffs, needsReview: review, scope: 'reviewed historical vendor claims, not full subscription or payment history' };
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
const rational = (n, d) => { const g = gcd(n, d); return { numerator: n / g, denominator: d / g }; };
export function projectMonthly(scope, records) {
  scopeKey(scope);
  const commitments = new Map(), review = [], observations = new Map();
  for (const row of bounded(records)) {
    selected(scope, row);
    const observationKey = JSON.stringify([row.sourceId, row.vendorId, row.accountId, row.planId]);
    const fingerprint = JSON.stringify([row.currency, row.amount, row.cadence, row.cadenceEvidence, row.currentTermsConfirmed,
      row.scanStatus, row.contentOmitted, row.senderAuthentication, row.nativeHold, row.truncated, row.safeContent]);
    if (observations.has(observationKey) && observations.get(observationKey) !== fingerprint)
      throw Error('Conflicting current-term source observation');
    observations.set(observationKey, fingerprint);
    if (!clean(row) || row.currentTermsConfirmed !== true || row.cadenceEvidence !== 'stated') {
      review.push({ sourceId: row.sourceId, reason: 'current_terms_not_confirmed' }); continue;
    }
    const denominator = new Map([['monthly', 1n], ['quarterly', 3n], ['annual', 12n]]).get(row.cadence);
    if (!denominator) { review.push({ sourceId: row.sourceId, reason: 'normalization_basis_needed' }); continue; }
    const amount = money(row.amount), k = key(row), prior = commitments.get(k);
    if (prior && (prior.amount !== amount || prior.denominator !== denominator)) throw Error('Conflicting current terms; no newest-wins assumption');
    if (prior) prior.sourceIds.push(row.sourceId);
    else commitments.set(k, { ...row, amount, denominator, sourceIds: [row.sourceId] });
  }
  const totals = new Map(), costRows = [];
  for (const row of commitments.values()) {
    const normalized = rational(row.amount, row.denominator);
    costRows.push({ vendorId: row.vendorId, accountId: row.accountId, planId: row.planId, currency: row.currency,
      statedAmount: decimal(row.amount), statedCadence: row.cadence, sourceIds: row.sourceIds,
      monthlyProjection: { numeratorBase18: normalized.numerator.toString(), denominator: normalized.denominator.toString(),
        exactDecimal: normalized.numerator % normalized.denominator === 0n ? decimal(normalized.numerator / normalized.denominator) : null,
        formula: `stated ${row.cadence} amount / ${row.denominator} months` } });
    const prior = totals.get(row.currency) ?? { numerator: 0n, denominator: 1n };
    totals.set(row.currency, rational(prior.numerator * normalized.denominator + normalized.numerator * prior.denominator, prior.denominator * normalized.denominator));
  }
  return { ...nonAuthorizing(scope), basis: 'monthly_budget_projection_not_cashflow_or_verified_charge', rows: costRows,
    totals: [...totals].map(([currency, x]) => ({ currency, numeratorBase18: x.numerator.toString(), denominator: x.denominator.toString(),
      exactDecimal: x.numerator % x.denominator === 0n ? decimal(x.numerator / x.denominator) : null })), needsReview: review };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, workspaceId, mailboxId, asOf, path, ...extra] = process.argv.slice(2);
    if (!['patterns', 'monthly'].includes(mode) || !path || extra.length) throw Error('Use patterns|monthly WORKSPACE MAILBOX AS_OF_DATE reviewed-rows.json');
    const info = await lstat(path);
    if (!info.isFile() || info.size > 1024 * 1024) throw Error('Expected regular reviewed JSON <= 1 MiB');
    const data = await readFile(path, 'utf8');
    if (Buffer.byteLength(data) > 1024 * 1024) throw Error('Input too large');
    console.log(JSON.stringify((mode === 'patterns' ? detectPatterns : projectMonthly)({ workspaceId, mailboxId, asOf }, JSON.parse(data)), null, 2));
  } catch { console.error('Invalid or conflicting scoped history input; no effect performed'); process.exitCode = 1; }
}
