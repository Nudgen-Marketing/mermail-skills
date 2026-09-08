import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const clean = x => typeof x === 'string' ? x.trim() : '';
const decimal = x => {
  if (typeof x !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(x)) return null;
  const [whole, fraction = ''] = x.split('.');
  const tail = fraction.replace(/0+$/, '');
  return BigInt(whole).toString() + (tail ? '.' + tail : '');
};
const mask = x => clean(x) ? '…' + clean(x).slice(-4) : null;

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
    if (!clean(r.network) || !clean(r.destination)) unresolved.push('missing_payment_details');
    const peers = comparable(r) && vendorId && invoiceId ? records.filter(p =>
      comparable(p) && clean(p.vendorId) === vendorId && clean(p.invoiceId) === invoiceId) : [r];
    if (peers.length > 1) {
      reasons.push('repeat_request');
      const terms = peers.filter(p => decimal(p.amount) !== null && clean(p.currency))
        .map(p => JSON.stringify([decimal(p.amount), clean(p.currency)]));
      if (new Set(terms).size > 1) reasons.push('amount_or_currency_conflict');
      const destinations = peers.filter(p => clean(p.network) && clean(p.destination))
        .map(p => JSON.stringify([clean(p.network), clean(p.destination)]));
      if (new Set(destinations).size > 1) reasons.push('inconsistent_payment_details');
    }
    const trusted = baselines.filter(b => vendorId && clean(b.vendorId) === vendorId && b.confirmedByUser === true);
    if (trusted.length !== 1) unresolved.push(trusted.length ? 'ambiguous_vendor_baseline' : 'no_confirmed_vendor_baseline');
    else if (!clean(trusted[0].network) || !clean(trusted[0].destination)) unresolved.push('incomplete_vendor_baseline');
    else if (comparable(r) && clean(r.network) && clean(r.destination) &&
      (clean(r.network) !== clean(trusted[0].network) || clean(r.destination) !== clean(trusted[0].destination)))
      reasons.push('payment_details_changed');
    return {
      emailId: clean(r.emailId), vendorId: vendorId || null, invoiceId: invoiceId || null,
      amount: comparable(r) ? r.amount ?? null : null,
      currency: comparable(r) ? clean(r.currency) || null : null,
      destinationSuffix: comparable(r) ? mask(r.destination) : null,
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
