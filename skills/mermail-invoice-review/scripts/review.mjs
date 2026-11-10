import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const clean = x => typeof x === 'string' ? x.trim() : '';
const decimal = x => {
  if (typeof x !== 'string' || x.length > 1024 || !/^\d+(?:\.\d{1,18})?$/.test(x)) return null;
  const [whole, fraction = ''] = x.split('.');
  const tail = fraction.replace(/0+$/, '');
  return BigInt(whole).toString() + (tail ? '.' + tail : '');
};
const mask = x => clean(x) ? '…' + clean(x).slice(-4) : null;
const rail = r => clean(r.paymentRail) || (clean(r.network) ? 'wallet' : '');
const paymentKey = r => {
  const type = rail(r);
  if (!['bank', 'wallet'].includes(type) || !clean(r.destination) || (type === 'wallet' && !clean(r.network))) return null;
  return JSON.stringify([type, clean(r.network), clean(r.destination)]);
};
const scaled = value => {
  const [w, f = ''] = decimal(value).split('.');
  return BigInt(w) * 10n ** 18n + BigInt(f.padEnd(18, '0'));
};
const amountString = value => {
  const sign = value < 0n ? '-' : '', n = value < 0n ? -value : value;
  const f = (n % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '');
  return sign + (n / (10n ** 18n)).toString() + (f ? '.' + f : '');
};
const percentString = (difference, base) => {
  if (base === 0n) return null;
  const sign = difference < 0n ? '-' : '', n = difference < 0n ? -difference : difference;
  const hundredths = (n * 10000n + base / 2n) / base;
  return (hundredths === 0n ? '' : sign) + (hundredths / 100n).toString() + '.' + (hundredths % 100n).toString().padStart(2, '0');
};

export function review(input) {
  if (!input || !Array.isArray(input.records) || input.records.length > 20)
    throw new Error('Expected at most 20 extracted records.');
  const baselines = input.baselines ?? [];
  if (!Array.isArray(baselines) || baselines.some(b => !b || typeof b !== 'object'))
    throw new Error('Expected a baseline array.');
  const seen = new Map();
  for (const record of input.records) {
    if (!record || typeof record !== 'object' || !clean(record.emailId))
      throw new Error('Each record requires an emailId.');
    const id = clean(record.emailId);
    if (seen.has(id) && JSON.stringify(seen.get(id)) !== JSON.stringify(record))
      throw new Error('Conflicting records for the same emailId.');
    seen.set(id, record);
  }
  const records = [...seen.values()];
  const comparable = r => r.scanStatus === 'clean' && r.contentComplete === true;
  return records.map(r => {
    const reasons = [];
    const unresolved = [];
    const vendorId = clean(r.vendorId);
    const invoiceId = clean(r.invoiceId);
    if (!comparable(r)) unresolved.push('content_unreviewed');
    if (r.senderAuth !== 'pass') unresolved.push('sender_auth_not_pass');
    if (!vendorId || !invoiceId) unresolved.push('missing_invoice_identity');
    if (decimal(r.amount) === null || !clean(r.currency)) unresolved.push('ambiguous_amount_or_currency');
    if (!paymentKey(r)) unresolved.push('missing_payment_details');
    const peers = comparable(r) && vendorId && invoiceId ? records.filter(p =>
      comparable(p) && clean(p.vendorId) === vendorId && clean(p.invoiceId) === invoiceId) : [r];
    if (peers.length > 1) {
      reasons.push('repeat_request');
      const terms = peers.filter(p => decimal(p.amount) !== null && clean(p.currency))
        .map(p => JSON.stringify([decimal(p.amount), clean(p.currency)]));
      if (new Set(terms).size > 1) reasons.push('amount_or_currency_conflict');
      const destinations = peers.map(paymentKey).filter(Boolean);
      if (new Set(destinations).size > 1) reasons.push('inconsistent_payment_details');
    }
    const trusted = baselines.filter(b => vendorId && clean(b.vendorId) === vendorId && b.confirmedByUser === true);
    if (trusted.length !== 1) unresolved.push(trusted.length ? 'ambiguous_vendor_baseline' : 'no_confirmed_vendor_baseline');
    else if (!paymentKey(trusted[0])) unresolved.push('incomplete_vendor_baseline');
    else if (comparable(r) && paymentKey(r) && paymentKey(r) !== paymentKey(trusted[0]))
      reasons.push('payment_details_changed');
    const amountComparisons = [];
    if (comparable(r) && r.senderAuth === 'pass' && vendorId && invoiceId && decimal(r.amount) !== null && clean(r.currency) &&
      r.comparisonApproved === true && clean(r.comparisonGroup) && clean(r.amountBasis)) {
      const history = records.filter(p => p !== r && comparable(p) && p.senderAuth === 'pass' &&
        p.comparisonApproved === true && clean(p.vendorId) === vendorId && clean(p.invoiceId) && clean(p.invoiceId) !== invoiceId &&
        clean(p.comparisonGroup) === clean(r.comparisonGroup) && clean(p.amountBasis) === clean(r.amountBasis) &&
        clean(p.currency) === clean(r.currency) && decimal(p.amount) !== null);
      for (const p of history) {
        const difference = scaled(r.amount) - scaled(p.amount);
        amountComparisons.push({sourceEmailId: clean(p.emailId), difference: amountString(difference),
          percentChange: percentString(difference, scaled(p.amount)), basis: clean(r.amountBasis), currency: clean(r.currency),
          interpretation: 'comparison_of_source_claims_not_fraud_or_payment_status'});
      }
      if (amountComparisons.some(p => p.difference !== '0')) reasons.push('comparable_amount_changed');
    }
    return {
      emailId: clean(r.emailId), vendorId: vendorId || null, invoiceId: invoiceId || null,
      amount: comparable(r) ? r.amount ?? null : null,
      currency: comparable(r) ? clean(r.currency) || null : null,
      destinationSuffix: comparable(r) ? mask(r.destination) : null,
      amountComparisons,
      status: reasons.length ? 'review_required' : unresolved.length ? 'insufficient_evidence' : 'no_detected_exception',
      reasons: [...reasons, ...unresolved], sourceEmailIds: peers.map(p => clean(p.emailId)),
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node review.mjs evidence.json');
    const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(review(input), null, 2) + '\n');
  } catch {
    process.stderr.write('Invoice review failed: check the local input against references/review.md. No input data printed.\n');
    process.exitCode = 1;
  }
}
