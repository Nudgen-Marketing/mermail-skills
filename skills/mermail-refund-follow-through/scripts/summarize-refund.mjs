#!/usr/bin/env node
/** Offline, deterministic checks of explicitly extracted refund observations. */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UNIT = 1_000_000n;
const LIMITS = { sources: 256, observations: 1024, text: 65_536, totalText: 2_097_152, fileBytes: 8_388_608 };
const KINDS = new Set(['promised', 'processed', 'authorization_release', 'reversed', 'unclear']);
const MONEY = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;
const REFERENCE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$/;
const PLAIN_ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
}
function string(value, path, maximum = 256, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) {
    fail(path, `expected ${allowEmpty ? 'a' : 'a nonempty'} string of at most ${maximum} characters`);
  }
}
function identifier(value, path) {
  string(value, path);
  if (value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail(path, 'invalid identifier');
}
function referenceIdentifier(value, path) {
  identifier(value, path);
  if (!REFERENCE_ID.test(value)) fail(path, 'expected an ASCII identifier with alphanumeric endpoints and only internal . _ : / - punctuation');
}
function boolean(value, path) { if (typeof value !== 'boolean') fail(path, 'expected a boolean'); }
function currency(value, path) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail(path, 'expected a three-letter uppercase currency');
}
function money(value, path) {
  if (typeof value !== 'string' || !MONEY.test(value)) {
    fail(path, 'expected a nonnegative decimal string, at most 12 whole digits and 6 fractional digits');
  }
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole) * UNIT + BigInt(fraction.padEnd(6, '0')), places: fraction.length };
}
function formatMoney(units, places) {
  const whole = units / UNIT;
  return places ? `${whole}.${(units % UNIT).toString().padStart(6, '0').slice(0, places)}` : `${whole}`;
}
function timestamp(value, path) {
  string(value, path, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail(path, 'expected an ISO timestamp with timezone and at most millisecond precision');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 ||
      (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) {
    fail(path, 'invalid calendar date, time, or timezone');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(path, 'invalid timestamp');
  return milliseconds;
}
function normalizeAddress(value) {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 320 && PLAIN_ADDRESS.test(normalized) ? normalized : null;
}
function array(value, path, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `expected an array with at most ${maximum} entries`);
}
function hasToken(text, token, monetary = false) {
  let start = -1;
  while ((start = text.indexOf(token, start + 1)) !== -1) {
    const before = text[start - 1] || '';
    const afterIndex = start + token.length;
    const after = text[afterIndex] || '';
    if (monetary) {
      if (!/[A-Za-z0-9_+.,-]/.test(before) && !/[A-Za-z0-9_]/.test(after) &&
          !(/[.,]/.test(after) && /[0-9]/.test(text[afterIndex + 1] || ''))) return true;
    } else if (!/[A-Za-z0-9_-]/.test(before) && !/[A-Za-z0-9_-]/.test(after)) return true;
  }
  return false;
}
function hasIdentifierToken(text, token) {
  // Letters/numbers from any alphabet, combining marks, invisible formatting,
  // and connector/dash punctuation can extend or visually disguise an ID.
  const continuation = /[\p{L}\p{N}\p{M}\p{Cf}\p{Pc}\p{Pd}/\\\uFF0E\uFF0F\uFF1A\u2024\u2044\u2215]/u;
  const at = index => index < 0 || index >= text.length ? '' : String.fromCodePoint(text.codePointAt(index));
  const beforeIndex = index => {
    const last = text.charCodeAt(index - 1);
    return at(index - (last >= 0xdc00 && last <= 0xdfff ? 2 : 1));
  };
  let start = -1;
  while ((start = text.indexOf(token, start + 1)) !== -1) {
    const before = beforeIndex(start);
    const afterIndex = start + token.length;
    const after = at(afterIndex);
    if (continuation.test(before) || continuation.test(after)) continue;
    // A period or colon is sentence punctuation only when it is separated
    // from an identifier on its far side. Thus RF-1. is valid, RF-1.7 is not.
    if (/[.:]/.test(before)) {
      const left = beforeIndex(start - 1);
      if (continuation.test(left) || /[.:]/.test(left)) continue;
    }
    if (/[.:]/.test(after)) {
      const right = at(afterIndex + 1);
      if (continuation.test(right) || /[.:]/.test(right)) continue;
    }
    return true;
  }
  return false;
}

/**
 * Checks supplied evidence only: it neither reads a mailbox nor verifies bank credit.
 * Throws TypeError for malformed packets; returns exclusions for well-shaped evidence
 * that fails a trust, scope, quotation, or reference check. Never mutates the packet.
 */
export function summarizeRefund(packet) {
  object(packet, 'packet');
  if (packet.schema_version !== 1) fail('schema_version', 'expected 1');
  object(packet.scope, 'scope');
  const scope = packet.scope;
  identifier(scope.mailbox_id, 'scope.mailbox_id');
  string(scope.merchant_sender, 'scope.merchant_sender', 320);
  const merchant = normalizeAddress(scope.merchant_sender);
  if (!merchant) fail('scope.merchant_sender', 'expected a plain email address without a display name');
  referenceIdentifier(scope.order_id, 'scope.order_id');
  currency(scope.currency, 'scope.currency');
  const expected = money(scope.expected_refund, 'scope.expected_refund');
  const dateStart = timestamp(scope.date_start, 'scope.date_start');
  const dateEnd = timestamp(scope.date_end, 'scope.date_end');
  const asOf = timestamp(scope.as_of, 'scope.as_of');
  if (dateStart > dateEnd) fail('scope.date_end', 'must be at or after date_start');
  if (asOf < dateStart) fail('scope.as_of', 'must be at or after date_start');
  object(packet.coverage, 'coverage');
  boolean(packet.coverage.complete, 'coverage.complete');
  string(packet.coverage.note, 'coverage.note', 2048, true);
  array(packet.sources, 'sources', LIMITS.sources);
  array(packet.observations, 'observations', LIMITS.observations);

  const sources = new Map();
  const accepted = [], excluded = [], uncertain = [], duplicates = [], conflicts = [], coverageGaps = [];
  let totalText = 0;
  for (const [index, source] of packet.sources.entries()) {
    const path = `sources[${index}]`;
    object(source, path);
    identifier(source.email_id, `${path}.email_id`);
    identifier(source.mailbox_id, `${path}.mailbox_id`);
    string(source.from, `${path}.from`, 320);
    const milliseconds = timestamp(source.date, `${path}.date`);
    string(source.scan_status, `${path}.scan_status`, 64);
    object(source.sender_authentication, `${path}.sender_authentication`);
    string(source.sender_authentication.status, `${path}.sender_authentication.status`, 64);
    boolean(source.content_omitted, `${path}.content_omitted`);
    if (source.content_truncated !== undefined) boolean(source.content_truncated, `${path}.content_truncated`);
    string(source.text, `${path}.text`, LIMITS.text, true);
    totalText += source.text.length;
    if (totalText > LIMITS.totalText) fail('sources', `combined text exceeds ${LIMITS.totalText} characters`);
    // Canonicalize the recognized fields; object key order cannot disguise a conflict.
    const fingerprint = JSON.stringify([
      source.email_id, source.mailbox_id, source.from, source.date, source.scan_status,
      source.sender_authentication.status, source.content_omitted, source.content_truncated ?? false, source.text,
    ]);
    if (sources.has(source.email_id)) {
      if (sources.get(source.email_id).fingerprint !== fingerprint) fail(path, 'conflicting duplicate email_id');
      duplicates.push({ reason: 'duplicate_source', email_id: source.email_id, source_index: index });
      continue;
    }
    sources.set(source.email_id, { source, milliseconds, fingerprint });
    if (source.mailbox_id === scope.mailbox_id && normalizeAddress(source.from) === merchant &&
        milliseconds >= dateStart && milliseconds <= dateEnd && milliseconds <= asOf) {
      const reasons = [];
      if (source.content_omitted) reasons.push('body_omitted');
      if (source.content_truncated) reasons.push('body_truncated');
      if (source.scan_status !== 'clean') reasons.push('scan_not_clean');
      if (source.sender_authentication.status !== 'pass') reasons.push(source.sender_authentication.status === 'unknown' ? 'authentication_unknown' : 'authentication_not_pass');
      if (reasons.length) coverageGaps.push({ email_id: source.email_id, reasons });
    }
  }
  const effectiveComplete = packet.coverage.complete && coverageGaps.length === 0;

  const refunds = new Map();
  let places = expected.places;
  for (const [index, observation] of packet.observations.entries()) {
    const path = `observations[${index}]`;
    object(observation, path);
    identifier(observation.email_id, `${path}.email_id`);
    if (!KINDS.has(observation.kind)) fail(`${path}.kind`, 'unrecognized observation kind');
    const amount = observation.amount === null ? null : money(observation.amount, `${path}.amount`);
    currency(observation.currency, `${path}.currency`);
    if (observation.refund_id !== null) referenceIdentifier(observation.refund_id, `${path}.refund_id`);
    string(observation.quote, `${path}.quote`, LIMITS.text);
    const evidence = {
      evidence_id: `observation:${index + 1}`, email_id: observation.email_id, kind: observation.kind,
      amount: observation.amount, currency: observation.currency, refund_id: observation.refund_id,
      quote: observation.quote,
    };
    const reasons = [];
    const entry = sources.get(observation.email_id);
    if (!entry) reasons.push('source_not_found');
    if (entry) {
      const { source, milliseconds } = entry;
      if (source.mailbox_id !== scope.mailbox_id) reasons.push('wrong_mailbox');
      const sender = normalizeAddress(source.from);
      if (!sender) reasons.push('sender_not_plain_address');
      else if (sender !== merchant) reasons.push('wrong_sender');
      if (milliseconds < dateStart) reasons.push('before_date_start');
      if (milliseconds > dateEnd) reasons.push('after_date_end');
      if (milliseconds > asOf) reasons.push('after_as_of');
      if (source.scan_status !== 'clean') reasons.push('scan_not_clean');
      if (source.sender_authentication.status !== 'pass') {
        reasons.push(source.sender_authentication.status === 'unknown' ? 'authentication_unknown' : 'authentication_not_pass');
      }
      if (source.content_omitted) reasons.push('body_omitted');
      if (source.content_truncated) reasons.push('body_truncated');
      if (!source.text.includes(observation.quote)) reasons.push('quote_not_exact_substring');
    }
    if (!hasIdentifierToken(observation.quote, scope.order_id)) reasons.push('order_not_in_quote');
    if (observation.currency !== scope.currency) reasons.push('wrong_currency');
    if (amount) {
      if (!hasToken(observation.quote, observation.amount, true)) reasons.push('exact_amount_not_in_quote');
      if (!hasToken(observation.quote, observation.currency)) reasons.push('currency_not_in_quote');
    } else if (['promised', 'processed'].includes(observation.kind)) reasons.push('missing_amount');
    if (observation.kind === 'processed') {
      if (!observation.refund_id) reasons.push('missing_refund_reference');
      else if (!hasIdentifierToken(observation.quote, observation.refund_id)) reasons.push('refund_reference_not_in_quote');
    }
    if (reasons.length) {
      excluded.push({ ...evidence, reasons });
      uncertain.push({ evidence_id: evidence.evidence_id, email_id: evidence.email_id, reasons });
      continue;
    }
    accepted.push(evidence);
    if (amount) places = Math.max(places, amount.places);
    if (observation.kind === 'reversed') {
      conflicts.push({ reason: 'reversal_requires_manual_review', refund_id: observation.refund_id, evidence_ids: [evidence.evidence_id] });
      continue;
    }
    if (observation.kind !== 'processed') {
      uncertain.push({ evidence_id: evidence.evidence_id, email_id: evidence.email_id, reasons: [`${observation.kind}_is_not_a_processed_refund_notice`] });
      continue;
    }
    const previous = refunds.get(observation.refund_id);
    if (!previous) {
      refunds.set(observation.refund_id, { units: amount.units, evidence_ids: [evidence.evidence_id], conflict: false });
    } else {
      previous.evidence_ids.push(evidence.evidence_id);
      if (previous.units !== amount.units) {
        previous.conflict = true;
      } else {
        duplicates.push({ reason: 'duplicate_refund_reference', refund_id: observation.refund_id, evidence_ids: [previous.evidence_ids[0], evidence.evidence_id] });
      }
    }
  }
  const processedRefunds = [];
  let total = 0n;
  for (const [refundId, refund] of refunds) {
    if (refund.conflict) conflicts.push({ reason: 'conflicting_amounts_for_refund_reference', refund_id: refundId, evidence_ids: refund.evidence_ids });
    else total += refund.units;
    processedRefunds.push({
      refund_id: refundId, amount: refund.conflict ? null : formatMoney(refund.units, places),
      currency: scope.currency, evidence_ids: refund.evidence_ids, status: refund.conflict ? 'conflict' : 'provider_reported_processed',
    });
  }
  const conflict = conflicts.length > 0;
  const remaining = total < expected.units ? expected.units - total : 0n;
  const warnings = [];
  if (!effectiveComplete) warnings.push('partial_mailbox_coverage');
  if (coverageGaps.length) warnings.push('source_evidence_gaps');
  if (excluded.length) warnings.push('some_evidence_excluded');
  if (duplicates.length) warnings.push('duplicate_evidence_deduplicated');
  if (conflict) warnings.push('manual_review_required_no_numeric_aggregate');
  if (!conflict && total > expected.units) warnings.push('processed_notices_exceed_expected_refund');
  return {
    schema_version: 1,
    scope: {
      mailbox_id: scope.mailbox_id, merchant_sender: merchant, order_id: scope.order_id,
      currency: scope.currency, expected_refund: scope.expected_refund,
      date_start: scope.date_start, date_end: scope.date_end, as_of: scope.as_of,
    },
    coverage: { complete: effectiveComplete, declared_complete: packet.coverage.complete, note: packet.coverage.note, gaps: coverageGaps },
    assessment: {
      status: conflict ? 'evidence_conflict' : !effectiveComplete ? 'partial_coverage' : uncertain.length ? 'review_needed' : 'notice_summary',
      bank_credit: 'unverified', warnings,
    },
    notices: {
      currency: scope.currency, decimal_places: places,
      processed_total: conflict ? null : formatMoney(total, places),
      total_basis: conflict ? 'unavailable_due_to_conflict' : effectiveComplete ? 'observed_notices' : 'lower_bound',
      amount_not_explained_by_notices: conflict ? null : formatMoney(remaining, places),
      processed_refunds: processedRefunds,
      evidence_ids: processedRefunds.flatMap(refund => refund.evidence_ids),
    },
    evidence: { accepted, excluded, uncertain, duplicates },
    conflicts,
    limitations: [
      'These checks validate supplied evidence fields and literal quotations; they do not establish actual bank credit.',
      'Observation meanings, sender authentication, scan results, and mailbox coverage are supplied by the caller and are not independently verified by this offline helper.',
      'Distinct reference IDs are counted once each; quoted or forwarded notices require extraction review to ensure each reference describes a distinct refund.',
      'Amount not explained by notices is arithmetic against the stated expected refund, not an amount owed or proof of missing bank credit.',
      ...(coverageGaps.length ? ['Effective coverage is partial because in-scope source content is truncated, omitted, unsafe, or lacks passing sender authentication. Excluded content may contain contrary evidence.'] : []),
      ...(!effectiveComplete ? [conflict
        ? 'Mailbox coverage is partial. Conflicting evidence prevents a numeric aggregate; further evidence and manual review are required.'
        : 'Mailbox coverage is partial. The processed total is a lower bound on qualifying supplied notices; the unexplained amount can decrease as evidence is added.'] : []),
    ],
  };
}

function main() {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node summarize-refund.mjs <evidence-packet.json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const file = process.argv[2];
    const metadata = statSync(file);
    if (!metadata.isFile() || metadata.size > LIMITS.fileBytes) throw new TypeError('input must be a regular JSON file no larger than 8 MiB');
    const bytes = readFileSync(file);
    if (bytes.length > LIMITS.fileBytes) throw new TypeError('input exceeds 8 MiB');
    process.stdout.write(`${JSON.stringify(summarizeRefund(JSON.parse(bytes.toString('utf8'))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Invalid refund evidence: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
