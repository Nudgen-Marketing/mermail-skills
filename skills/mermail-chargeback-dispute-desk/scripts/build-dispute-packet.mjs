#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function fail(message) {
  console.error(message);
  process.exit(2);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function uniqueDefined(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function asString(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${label} must be a string when present`);
  return value;
}

function normalizeEvidenceList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${label} must be an array of strings`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

function normalizeSourceRole(value, label) {
  const role = asString(value, label) ?? 'unknown';
  if (!['provider', 'customer', 'internal', 'unknown'].includes(role)) {
    fail(`${label} must be one of provider, customer, internal, unknown`);
  }
  return role;
}

function normalizeCorrections(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${label}[${index}] must be an object`);
    }
    const field = asString(item.field, `${label}[${index}].field`);
    const supersedesEmailId = asString(item.supersedesEmailId, `${label}[${index}].supersedesEmailId`);
    if (!field || !supersedesEmailId) fail(`${label}[${index}] requires field and supersedesEmailId`);
    return { field, supersedesEmailId };
  });
}

function fieldProvenance(messages, field, excludedEmailIds = new Set()) {
  const byValue = new Map();
  for (const message of messages) {
    if (excludedEmailIds.has(message.emailId)) continue;
    const value = message[field];
    if (value === undefined || value === null || value === '') continue;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(message.emailId);
  }
  return [...byValue.entries()]
    .map(([value, emailIds]) => ({ value, emailIds: [...new Set(emailIds)].sort() }))
    .sort((a, b) => String(a.value).localeCompare(String(b.value)));
}

function conflictField(messages, field, excludedEmailIds = new Set()) {
  const values = fieldProvenance(messages, field, excludedEmailIds);
  return values.length > 1 ? { field, values } : null;
}

function parseTimestamp(value, label) {
  if (!value) fail(`${label} is required for an explicit correction`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a parseable timestamp for an explicit correction`);
  return parsed;
}

const inputPath = process.argv[2];
if (!inputPath) fail('usage: node build-dispute-packet.mjs <input.json>');

let input;
try {
  input = JSON.parse(await readFile(inputPath, 'utf8'));
} catch (error) {
  fail(`invalid input: ${error.message}`);
}

if (!input || typeof input !== 'object') fail('input must be an object');
if (!Array.isArray(input.messages) || input.messages.length === 0) fail('messages must be a non-empty array');
if (input.messages.length > 10) fail('messages exceeds bounded full-body evidence limit of 10');

const messages = input.messages.map((message, index) => {
  if (!message || typeof message !== 'object') fail(`messages[${index}] must be an object`);
  const emailId = asString(message.emailId, `messages[${index}].emailId`);
  if (!emailId) fail(`messages[${index}].emailId is required`);
  const scanStatus = asString(message.scanStatus, `messages[${index}].scanStatus`);
  if (scanStatus !== 'clean') fail(`messages[${index}] is not scan-clean`);

  return {
    emailId,
    receivedAt: asString(message.receivedAt, `messages[${index}].receivedAt`),
    senderAuthentication: asString(message.senderAuthentication, `messages[${index}].senderAuthentication`) ?? 'unknown',
    sourceRole: normalizeSourceRole(message.sourceRole, `messages[${index}].sourceRole`),
    provider: asString(message.provider, `messages[${index}].provider`),
    caseReference: asString(message.caseReference, `messages[${index}].caseReference`),
    amount: asString(message.amount, `messages[${index}].amount`),
    currency: asString(message.currency, `messages[${index}].currency`),
    reasonCode: asString(message.reasonCode, `messages[${index}].reasonCode`),
    reasonText: asString(message.reasonText, `messages[${index}].reasonText`),
    responseDeadline: asString(message.responseDeadline, `messages[${index}].responseDeadline`),
    requestedEvidence: normalizeEvidenceList(message.requestedEvidence, `messages[${index}].requestedEvidence`),
    caseState: asString(message.caseState, `messages[${index}].caseState`),
    securitySignals: normalizeEvidenceList(message.securitySignals, `messages[${index}].securitySignals`),
    explicitCorrections: normalizeCorrections(message.explicitCorrections, `messages[${index}].explicitCorrections`),
  };
});

const emailIds = messages.map((message) => message.emailId);
if (new Set(emailIds).size !== emailIds.length) fail('messages contains duplicate emailId values');

messages.sort((a, b) => a.emailId.localeCompare(b.emailId));
const messagesById = new Map(messages.map((message) => [message.emailId, message]));

const materialFields = [
  'provider',
  'caseReference',
  'amount',
  'currency',
  'reasonCode',
  'reasonText',
  'responseDeadline',
  'caseState',
];
const correctableFields = new Set(materialFields.filter((field) => !['provider', 'caseReference'].includes(field)));
const supersededByField = new Map(materialFields.map((field) => [field, new Set()]));
const superseded = [];
const correctionKeys = new Set();

for (const correctingMessage of messages) {
  for (const correction of correctingMessage.explicitCorrections) {
    if (!correctableFields.has(correction.field)) {
      fail(`explicit correction field ${correction.field} is not supported`);
    }
    if (correctingMessage.sourceRole !== 'provider') {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} requires sourceRole provider`);
    }
    if (correctingMessage.senderAuthentication !== 'pass') {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} requires senderAuthentication pass`);
    }
    const target = messagesById.get(correction.supersedesEmailId);
    if (!target) fail(`explicit correction target ${correction.supersedesEmailId} was not found`);
    if (target.emailId === correctingMessage.emailId) fail('explicit correction cannot supersede the same email');
    if (target.sourceRole !== 'provider') {
      fail(`explicit correction target ${target.emailId} requires sourceRole provider`);
    }
    if (!correctingMessage.caseReference || !target.caseReference || correctingMessage.caseReference !== target.caseReference) {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} must stay within one caseReference`);
    }
    if (!correctingMessage.provider || !target.provider || correctingMessage.provider !== target.provider) {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} must stay within one provider`);
    }
    const replacementValue = correctingMessage[correction.field];
    const supersededValue = target[correction.field];
    if (!replacementValue || !supersededValue || replacementValue === supersededValue) {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} must replace a different non-empty value`);
    }
    const correctingTime = parseTimestamp(correctingMessage.receivedAt, `message ${correctingMessage.emailId}.receivedAt`);
    const targetTime = parseTimestamp(target.receivedAt, `message ${target.emailId}.receivedAt`);
    if (correctingTime <= targetTime) {
      fail(`explicit correction ${correctingMessage.emailId}:${correction.field} must be received after ${target.emailId}`);
    }
    const key = `${correction.field}\u0000${target.emailId}\u0000${correctingMessage.emailId}`;
    if (correctionKeys.has(key)) fail(`duplicate explicit correction ${correctingMessage.emailId}:${correction.field}`);
    correctionKeys.add(key);
    supersededByField.get(correction.field).add(target.emailId);
    superseded.push({
      field: correction.field,
      supersededEmailId: target.emailId,
      supersededValue,
      byEmailId: correctingMessage.emailId,
      replacementValue,
    });
  }
}

superseded.sort((a, b) =>
  a.field.localeCompare(b.field)
  || a.supersededEmailId.localeCompare(b.supersededEmailId)
  || a.byEmailId.localeCompare(b.byEmailId),
);

const provenance = Object.fromEntries(
  materialFields
    .map((field) => [field, fieldProvenance(messages, field)])
    .filter(([, values]) => values.length > 0),
);
const activeProvenance = Object.fromEntries(
  materialFields
    .map((field) => [field, fieldProvenance(messages, field, supersededByField.get(field))])
    .filter(([, values]) => values.length > 0),
);

const conflicts = [
  conflictField(messages, 'caseReference', supersededByField.get('caseReference')),
  conflictField(messages, 'amount', supersededByField.get('amount')),
  conflictField(messages, 'currency', supersededByField.get('currency')),
  conflictField(messages, 'reasonCode', supersededByField.get('reasonCode')),
  conflictField(messages, 'reasonText', supersededByField.get('reasonText')),
  conflictField(messages, 'responseDeadline', supersededByField.get('responseDeadline')),
  conflictField(messages, 'caseState', supersededByField.get('caseState')),
].filter(Boolean);

const requestedEvidence = [...new Set(messages.flatMap((message) => message.requestedEvidence))].sort();
const evidencePresent = normalizeEvidenceList(input.evidencePresent, 'evidencePresent');
const missingEvidence = requestedEvidence.filter((item) => !evidencePresent.includes(item));
const securitySignals = [...new Set(messages.flatMap((message) => message.securitySignals))].sort();

const resolvedValue = (field) => {
  const excluded = supersededByField.get(field) ?? new Set();
  const values = uniqueDefined(messages.filter((message) => !excluded.has(message.emailId)).map((message) => message[field]))
    .sort((a, b) => String(a).localeCompare(String(b)));
  return values.length === 1 ? values[0] : null;
};
let state = 'ready_for_review';
if (securitySignals.length > 0) state = 'unsafe';
else if (conflicts.length > 0) state = 'conflict';
else if (missingEvidence.length > 0) state = 'needs_evidence';

const packetCore = {
  schemaVersion: 4,
  case: {
    provider: resolvedValue('provider'),
    caseReference: resolvedValue('caseReference'),
    amount: resolvedValue('amount'),
    currency: resolvedValue('currency'),
    reasonCode: resolvedValue('reasonCode'),
    reasonText: resolvedValue('reasonText'),
    responseDeadline: resolvedValue('responseDeadline'),
    caseState: resolvedValue('caseState'),
  },
  state,
  sources: messages.map((message) => ({
    emailId: message.emailId,
    receivedAt: message.receivedAt,
    senderAuthentication: message.senderAuthentication,
    sourceRole: message.sourceRole,
  })),
  provenance,
  activeProvenance,
  superseded,
  requestedEvidence,
  evidencePresent,
  missingEvidence,
  conflicts,
  securitySignals,
  sendAllowed: false,
  walletAllowed: false,
};

const digest = createHash('sha256').update(JSON.stringify(stable(packetCore))).digest('hex');
const packet = {
  ...packetCore,
  evidenceDigestSha256: digest,
  recommendedNextAction:
    state === 'unsafe' ? 'stop_for_human_security_review' :
    state === 'conflict' ? 'resolve_material_conflicts' :
    state === 'needs_evidence' ? 'collect_missing_evidence' :
    'review_before_draft',
};

process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
