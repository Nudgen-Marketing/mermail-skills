// Offline, normalized-input analysis only. No mailbox access, durable state,
// authentication, evidence verification, effects or effect authorization.
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 160 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(x);
export function units(value, decimals = 6) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || typeof value !== 'string' ||
      value.length > 48 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw Error('Invalid exact decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw Error('Excess precision');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}
export function landed({ unitPrice, quantity, tax, shipping, fees, decimals }) {
  const count = units(quantity, 0);
  if (count <= 0n) throw Error('Positive integral quantity required');
  return (units(unitPrice, decimals) * count + units(tax, decimals) +
    units(shipping, decimals) + units(fees, decimals)).toString();
}
const fields = {
  RFQ: ['rfq-id', 'version', 'scope', 'quantity', 'reply-by', 'currency', 'criteria', 'budget-ceiling'],
  QUOTE: ['rfq-id', 'version', 'vendor', 'price', 'price-unit', 'spec-fit', 'turnaround', 'valid-until', 'payment-terms'],
  COUNTER: ['rfq-id', 'version', 'round', 'lever', 'current', 'requested', 'valid-until'],
  AWARD: ['rfq-id', 'version', 'awarded-to', 'final-terms', 'accept-by', 'next-steps'],
};
export function parseBlocks(body, expectedId, expectedVersion) {
  if (typeof body !== 'string' || body.length > 10000 || !text(expectedId) || !text(expectedVersion))
    throw Error('Invalid bounded block input');
  const pattern = /---- BEGIN (RFQ|QUOTE|COUNTER|AWARD)-BLOCK ----\r?\n([\s\S]*?)\r?\n---- END \1-BLOCK ----/g;
  const matches = [...body.matchAll(pattern)];
  if (matches.length > 4) throw Error('Too many blocks');
  // A partial/nested/extra marker cannot be silently discarded as prose.
  const remainder = body.replace(pattern, '');
  if (/---- (?:BEGIN|END) [A-Z]+-BLOCK ----/.test(remainder)) throw Error('Unmatched block marker');
  if (!matches.length) return { status: 'owner_extraction_required', blocks: [], authorizesEffect: false };
  const blocks = matches.map(([, type, raw]) => {
    const values = Object.create(null);
    for (const line of raw.split(/\r?\n/)) {
      const part = /^([a-z][a-z0-9-]*):[ \t]*(.*?)\s*$/.exec(line);
      if (!part || !fields[type].includes(part[1]) || Object.hasOwn(values, part[1]) || !text(part[2]))
        throw Error('Unknown, duplicate or malformed block field');
      values[part[1]] = part[2];
    }
    if (fields[type].some(k => !Object.hasOwn(values, k)) || values['rfq-id'] !== expectedId ||
        values.version !== expectedVersion) throw Error('Missing field or mismatched RFQ identity');
    return { type, values };
  });
  return { status: 'parsed_claims_only', blocks, authorizesEffect: false };
}
function time(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)) return NaN;
  const n = Date.parse(x);
  return Number.isFinite(n) && new Date(n).toISOString() === x ? n : NaN;
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const fraction = (n, d) => { const g = gcd(n < 0n ? -n : n, d); return [n / g, d / g]; };
const add = ([a, b], [c, d]) => fraction(a * d + c * b, b * d);
export function compareQuotes(policy, quotes) {
  if (!policy || policy.ownerConfirmed !== true || !['workspaceId', 'mailboxId', 'rfqId', 'version', 'currency', 'unit', 'specKey', 'quantity'].every(k => text(policy[k])) ||
      !Number.isFinite(time(policy.now)) || !Number.isFinite(time(policy.replyBy)) ||
      !Array.isArray(policy.criteria) || !policy.criteria.length || policy.criteria.length > 6 ||
      !Array.isArray(quotes) || quotes.length > 6 || !Array.isArray(policy.vendors) || policy.vendors.length > 6 ||
      typeof policy.allowUnverifiedComparison !== 'boolean' || !Number.isInteger(policy.moneyDecimals) ||
      policy.moneyDecimals < 0 || policy.moneyDecimals > 18 || units(policy.quantity, 0) <= 0n)
    throw Error('Frozen bounded owner rubric required');
  const names = new Set();
  let weights = 0;
  for (const criterion of policy.criteria) {
    if (!text(criterion.name) || names.has(criterion.name) || !['lower', 'higher'].includes(criterion.direction) ||
        !Number.isInteger(criterion.weight) || criterion.weight <= 0 || criterion.weight > 100 ||
        criterion.method !== 'ratio_to_best') throw Error('Explicit numeric criterion required');
    names.add(criterion.name); weights += criterion.weight;
  }
  if (weights !== 100) throw Error('Weights must sum to 100');
  const vendorMap = new Map();
  for (const v of policy.vendors) {
    if (!v || !['id', 'sender', 'threadId'].every(k => text(v[k])) || !Number.isFinite(time(v.dispatchedAt)) ||
        vendorMap.has(v.id)) throw Error('Unique approved vendor identities and dispatch evidence required');
    vendorMap.set(v.id, v);
  }
  const seen = new Set(), eligible = [], excluded = [];
  const budget = units(policy.budget, policy.moneyDecimals);
  for (const q of quotes) {
    if (!q || !text(q.vendorId) || seen.has(q.vendorId)) throw Error('Select one explicitly current quote per vendor');
    seen.add(q.vendorId);
    const vendor = vendorMap.get(q.vendorId);
    const reasons = [];
    if (!vendor || q.sender !== vendor.sender || q.threadId !== vendor.threadId ||
        ['workspaceId', 'mailboxId', 'rfqId', 'version'].some(k => q[k] !== policy[k]) || !text(q.emailId)) reasons.push('unbound_source');
    if (q.scan !== 'clean' || q.safeContent !== true || q.contentOmitted !== false || q.nativeHold !== false ||
        q.truncated !== false || q.authoredSeparated !== true || !Number.isInteger(q.bodyChars) || q.bodyChars < 0 || q.bodyChars > 10000) reasons.push('unsafe_or_incomplete');
    if (!['pass', 'unknown', 'fail'].includes(q.authentication) || q.authentication === 'fail' ||
        (q.authentication !== 'pass' && !policy.allowUnverifiedComparison)) reasons.push('identity_not_established');
    const received = time(q.receivedAt), dispatched = time(vendor?.dispatchedAt), expiry = time(q.expiresAt);
    if (![received, dispatched, expiry].every(Number.isFinite) || received < dispatched || received > time(policy.now)) reasons.push('invalid_source_time');
    if (received > time(policy.replyBy) && q.ownerIncludedLate !== true) reasons.push('late_requires_owner_inclusion');
    if (expiry <= time(policy.now)) reasons.push('expired_quote');
    if (['currency', 'unit', 'specKey', 'quantity'].some(k => q[k] !== policy[k]) || q.allCostsKnown !== true || q.firmPrice !== true ||
        q.hardConstraintsMet !== true) reasons.push('not_comparable');
    if (typeof q.paymentPressure !== 'boolean' || typeof q.payeeChanged !== 'boolean') reasons.push('unreviewed_material_alerts');
    if (q.paymentPressure === true || q.payeeChanged === true) reasons.push('independent_review_required');
    let total, metrics;
    try {
      total = units(q.total, policy.moneyDecimals);
      metrics = policy.criteria.map(c => c.name === 'total' ? total : units(q.metrics?.[c.name], 6));
    } catch { reasons.push('missing_or_invalid_numeric_evidence'); }
    if (reasons.length) { excluded.push({ vendorId: q.vendorId, sourceId: q.emailId ?? null, reasons }); continue; }
    eligible.push({ q, total, metrics });
  }
  const best = policy.criteria.map((c, i) => eligible.reduce((value, row) => value === null ? row.metrics[i] :
    c.direction === 'lower' ? (row.metrics[i] < value ? row.metrics[i] : value) :
      (row.metrics[i] > value ? row.metrics[i] : value), null));
  const scores = eligible.map(row => {
    let score = [0n, 1n];
    policy.criteria.forEach((c, i) => {
      const value = row.metrics[i], optimum = best[i];
      const ratio = c.direction === 'higher' ? (optimum === 0n ? [1n, 1n] : [value, optimum]) :
        value === 0n ? [1n, 1n] : [optimum, value];
      score = add(score, [ratio[0] * BigInt(c.weight), ratio[1]]);
    });
    return { ...row, score };
  });
  scores.sort((a, b) => { const d = a.score[0] * b.score[1] - b.score[0] * a.score[1]; return d > 0n ? -1 : d < 0n ? 1 : a.q.vendorId.localeCompare(b.q.vendorId); });
  let rank = 0, previous;
  const ranked = scores.map((row, i) => {
    if (!previous || row.score[0] * previous[1] !== previous[0] * row.score[1]) rank = i + 1;
    previous = row.score;
    const tenths = (row.score[0] * 20n + row.score[1]) / (row.score[1] * 2n);
    return { vendorId: row.q.vendorId, sourceId: row.q.emailId, rank,
      score: `${tenths / 10n}.${tenths % 10n}`, scoreExact: row.score.map(String),
      totalBaseUnits: row.total.toString(), overBudget: row.total > budget,
      identityUnverified: row.q.authentication !== 'pass' };
  });
  return { ranked, excluded, authorizesEffect: false, awardAuthorized: false };
}
export function counterChange(before, after, history, maximum = 2) {
  const levers = ['price', 'terms', 'quantity', 'timeline'];
  if (!before || !after || !Array.isArray(history) || !Number.isInteger(maximum) || maximum < 1 || maximum > 2 ||
      history.length >= maximum || levers.some(k => !text(before[k]) || !text(after[k])) ||
      [...Object.keys(before), ...Object.keys(after)].some(k => !levers.includes(k)) ||
      history.some((row, i) => !row || row.round !== i + 1 || !levers.includes(row.lever) || !text(row.sourceId) || row.status !== 'quoted'))
    throw Error('Valid bounded completed round history required');
  const changed = levers.filter(k => before[k] !== after[k]);
  if (changed.length !== 1) throw Error('Exactly one lever per counter');
  return { round: history.length + 1, lever: changed[0], current: before[changed[0]], requested: after[changed[0]], authorizesEffect: false };
}
