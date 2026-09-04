import {
  createClaimProposal,
  sha256Canonical,
} from "../evidence/adapter-evidence.mjs";
import {
  OBSERVATION_ROLES,
  createRecipientObservation,
  verifyRecipientClaim,
} from "../evidence/recipient-evidence.mjs";
import {
  R5_VERSIONS,
  FIELD_STATUS,
  fieldSpecFor,
  validateLanePacket,
} from "./lane-packet.mjs";
import { R5ParserError, parseWorkerProposal } from "./strict-proposal-parser.mjs";

const OUTPUT_KEYS = Object.freeze([
  "declassification_schema_version",
  "lane_id",
  "supplier_id",
  "worker_output_state",
  "field_statuses",
  "verified_claims",
  "unknown_fields",
  "blocked_fields",
  "conflicts",
  "rejected_proposals",
  "declassification_digest",
]);

const FIELD_STATUS_KEYS = Object.freeze(["field_name", "required", "status", "reason"]);
const VERIFIED_CLAIM_KEYS = Object.freeze([
  "field_name",
  "normalized_value",
  "unit",
  "currency",
  "evidence_id",
  "evidence_record_digest",
  "source_snapshot_digest",
  "source_span",
]);
const REJECTION_KEYS = Object.freeze(["index", "code"]);
const DIGEST_RE = /^[a-f0-9]{64}$/u;

export class R5DeclassificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R5DeclassificationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R5DeclassificationError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  return value;
}

function exactKeys(value, allowed, path) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("UNKNOWN_OR_MISSING_KEY", `${path} has an unexpected or missing key`, { path });
}

function requireString(value, path, max = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail("INVALID_STRING", `${path} must be a bounded string`, { path });
  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") fail("INVALID_BOOLEAN", `${path} must be boolean`, { path });
  return value;
}

function requireInteger(value, path) {
  if (!Number.isSafeInteger(value)) fail("INVALID_INTEGER", `${path} must be a safe integer`, { path });
  return value;
}

function requireDigest(value, path) {
  requireString(value, path, 64);
  if (!DIGEST_RE.test(value)) fail("INVALID_DIGEST", `${path} must be lowercase SHA-256 hex`, { path });
  return value;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function workerValueMatchesField(fieldSpec, value) {
  switch (fieldSpec.field_name) {
    case "delivery_days":
      return hasExactKeys(value, ["days"])
        && (Number.isSafeInteger(value.days) || (typeof value.days === "string" && /^[0-9]+$/u.test(value.days)));
    case "price":
      return hasExactKeys(value, ["amount", "currency"])
        && (typeof value.amount === "string" || (typeof value.amount === "number" && Number.isFinite(value.amount)))
        && typeof value.currency === "string";
    case "payment_terms":
      return typeof value === "string";
    case "no_revision":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function safeRejectCode(result) {
  const state = result?.verification_state;
  const reason = result?.reason;
  if (state === "SOURCE_BLOCKED") return "SOURCE_BLOCKED";
  if (state === "SOURCE_UNAVAILABLE") return "SOURCE_UNAVAILABLE";
  if (state === "AMBIGUOUS") return "AMBIGUOUS_SOURCE_OR_SPAN";
  if (state === "LATE") return "LATE_SOURCE";
  if (state === "CONFLICT") return "CONFLICTING_EVIDENCE";
  if (state === "UNSUPPORTED") return "VALUE_NOT_SUPPORTED_BY_SOURCE";
  if (state === "UNKNOWN") return reason === "sender_authentication_not_pass" ? "AUTHENTICATION_POLICY_UNKNOWN" : "VERIFICATION_UNKNOWN";
  return "R4_REJECTED";
}

function emptyFieldStatuses(packet, reason = "NO_ACCEPTED_CLAIM") {
  return packet.common_field_schema.map((field) => ({
    field_name: field.field_name,
    required: field.required,
    status: FIELD_STATUS.UNKNOWN,
    reason,
  }));
}

function finalizeOutput(base) {
  const output = { ...base, declassification_digest: null };
  output.declassification_digest = sha256Canonical(output);
  exactKeys(output, OUTPUT_KEYS, "declassified_output");
  return deepFreeze(output);
}

function rejection(index, code) {
  return { index, code };
}

function rejectedOutput(packet, code) {
  const fields = emptyFieldStatuses(packet, "WORKER_OUTPUT_REJECTED");
  return finalizeOutput({
    declassification_schema_version: R5_VERSIONS.declassified,
    lane_id: packet.lane_id,
    supplier_id: packet.supplier_id,
    worker_output_state: "REJECTED",
    field_statuses: fields,
    verified_claims: [],
    unknown_fields: fields.map(({ field_name, required }) => ({ field_name, required, reason: "WORKER_OUTPUT_REJECTED" })),
    blocked_fields: [],
    conflicts: [],
    rejected_proposals: code ? [rejection(-1, code)] : [],
  });
}

function currentTextFragment(snapshot, span) {
  const text = snapshot?.content?.current_text;
  if (typeof text !== "string") return null;
  if (span.start < 0 || span.end <= span.start || span.end > text.length) return null;
  return text.slice(span.start, span.end);
}

function makeR4Proposal(packet, claim, snapshot, fieldSpec) {
  const fragment = currentTextFragment(snapshot, claim.source_span);
  if (fragment === null) return null;
  return createClaimProposal({
    proposal_schema_version: "r4.claim-proposal.v1",
    sourcing_id: packet.sourcing_id,
    round_id: packet.round_id,
    supplier_id: packet.supplier_id,
    source_snapshot_digest: claim.source_snapshot_digest,
    mailbox_id: snapshot.mailbox_id,
    email_id: snapshot.email_id,
    provider_message_id: snapshot.provider_message_id,
    source_span: clone(claim.source_span),
    raw_source_fragment: fragment,
    field_name: fieldSpec.field_name,
    proposed_value: clone(claim.proposed_normalized_value),
    proposed_unit: fieldSpec.unit,
    proposed_currency: fieldSpec.currency,
    producer: { kind: "LLM_PROPOSAL", reference: "r5-untrusted-worker" },
  });
}

function makeAcceptedClaim(fieldSpec, claim, result) {
  return {
    field_name: fieldSpec.field_name,
    normalized_value: clone(result.normalized_value),
    unit: result.unit ?? null,
    currency: result.currency ?? null,
    evidence_id: result.evidence_id,
    evidence_record_digest: result.record_digest,
    source_snapshot_digest: result.receipt_snapshot_digest,
    source_span: clone(result.source_span),
  };
}

function sameAcceptedClaim(left, right) {
  return sha256Canonical(left) === sha256Canonical(right);
}

function buildFieldResult(packet, evaluations) {
  const byField = new Map(packet.common_field_schema.map((field) => [field.field_name, { field, verified: [], failures: [] }]));
  const rejected = [];
  for (const evaluation of evaluations) {
    const bucket = byField.get(evaluation.field_name);
    if (!bucket) {
      rejected.push(rejection(evaluation.index, "FIELD_NOT_ALLOWED"));
      continue;
    }
    if (evaluation.result?.verification_state === "VERIFIED") {
      bucket.verified.push({ index: evaluation.index, claim: evaluation.claim, accepted: makeAcceptedClaim(bucket.field, evaluation.claim, evaluation.result) });
    } else {
      bucket.failures.push(evaluation.result);
      rejected.push(rejection(evaluation.index, safeRejectCode(evaluation.result)));
    }
  }

  const verifiedClaims = [];
  const conflicts = [];
  const blocked = new Set();
  const statuses = [];
  for (const { field, verified, failures } of byField.values()) {
    if (verified.length === 0) {
      const blockedOnly = failures.length > 0 && failures.every((result) => result?.verification_state === "SOURCE_BLOCKED");
      const status = blockedOnly ? FIELD_STATUS.BLOCKED : FIELD_STATUS.UNKNOWN;
      statuses.push({ field_name: field.field_name, required: field.required, status, reason: blockedOnly ? "R4_SOURCE_BLOCKED" : "NO_VERIFIED_CLAIM" });
      if (blockedOnly) blocked.add(field.field_name);
      continue;
    }
    const first = verified[0];
    const allEquivalent = verified.every((candidate) => sameAcceptedClaim(candidate.accepted, first.accepted));
    if (!allEquivalent) {
      conflicts.push({ field_name: field.field_name, required: field.required, reason: "MULTIPLE_INCOMPATIBLE_VERIFIED_CLAIMS" });
      statuses.push({ field_name: field.field_name, required: field.required, status: FIELD_STATUS.CONFLICT, reason: "MULTIPLE_INCOMPATIBLE_VERIFIED_CLAIMS" });
      for (const candidate of verified) rejected.push(rejection(candidate.index, "MULTIPLE_INCOMPATIBLE_CLAIMS"));
      continue;
    }
    verifiedClaims.push(first.accepted);
    statuses.push({ field_name: field.field_name, required: field.required, status: FIELD_STATUS.VERIFIED, reason: "R4_REVERIFIED" });
    for (const duplicate of verified.slice(1)) rejected.push(rejection(duplicate.index, "DUPLICATE_EQUIVALENT_CLAIM"));
  }
  statuses.sort((left, right) => left.field_name.localeCompare(right.field_name));
  verifiedClaims.sort((left, right) => left.field_name.localeCompare(right.field_name));
  conflicts.sort((left, right) => left.field_name.localeCompare(right.field_name));
  const unknownFields = statuses.filter((field) => field.status === FIELD_STATUS.UNKNOWN).map(({ field_name, required }) => ({ field_name, required, reason: "NO_VERIFIED_CLAIM" }));
  const blockedFields = statuses.filter((field) => field.status === FIELD_STATUS.BLOCKED).map(({ field_name, required }) => ({ field_name, required, reason: "R4_SOURCE_BLOCKED" }));
  rejected.sort((left, right) => left.index - right.index || left.code.localeCompare(right.code));
  return { statuses, verifiedClaims, unknownFields, blockedFields, conflicts, rejected };
}

export function declassifyWorkerOutput({ packet, raw_worker_output, require_authenticated_sender = false }) {
  validateLanePacket(packet);
  let parsed;
  try {
    parsed = parseWorkerProposal(raw_worker_output);
  } catch (error) {
    return rejectedOutput(packet, error instanceof R5ParserError ? error.code : "PARSER_REJECTED");
  }
  if (parsed.supplier_id !== packet.supplier_id) return rejectedOutput(packet, "SUPPLIER_ID_MISMATCH");

  const snapshots = new Map(packet.source_snapshots.map((snapshot) => [snapshot.source_snapshot_digest, snapshot]));
  const evaluations = [];
  for (const [index, claim] of parsed.source_claims.entries()) {
    const fieldSpec = fieldSpecFor(packet, claim.field_name);
    if (!fieldSpec) {
      evaluations.push({ index, field_name: null, claim, result: { verification_state: "UNSUPPORTED", reason: "FIELD_NOT_ALLOWED" } });
      continue;
    }
    if (!workerValueMatchesField(fieldSpec, claim.proposed_normalized_value)) {
      evaluations.push({ index, field_name: fieldSpec.field_name, claim, result: { verification_state: "UNSUPPORTED", reason: "WORKER_VALUE_SHAPE" } });
      continue;
    }
    const snapshot = snapshots.get(claim.source_snapshot_digest);
    if (!snapshot) {
      evaluations.push({ index, field_name: fieldSpec.field_name, claim, result: { verification_state: "SOURCE_UNAVAILABLE", reason: "ASSIGNED_SOURCE_NOT_FOUND" } });
      continue;
    }
    let proposal;
    try {
      proposal = makeR4Proposal(packet, claim, snapshot, fieldSpec);
    } catch (error) {
      evaluations.push({ index, field_name: fieldSpec.field_name, claim, result: { verification_state: "UNKNOWN", reason: error?.code ?? "R4_PROPOSAL_REJECTED" } });
      continue;
    }
    if (!proposal) {
      evaluations.push({ index, field_name: fieldSpec.field_name, claim, result: { verification_state: "SOURCE_BLOCKED", reason: "CURRENT_SAFE_TEXT_UNAVAILABLE" } });
      continue;
    }
    let result;
    try {
      const observation = createRecipientObservation({ source_snapshot: snapshot, observation_role: OBSERVATION_ROLES.BUYER_RECEIVED });
      result = verifyRecipientClaim({
        observation,
        supplier_context: packet.supplier_attribution_context,
        raw_proposal: proposal,
        buyer_mailbox_id: snapshot.mailbox_id,
        require_authenticated_sender,
      });
    } catch (error) {
      result = { verification_state: "UNKNOWN", reason: error?.code ?? "R4_VERIFICATION_ERROR" };
    }
    evaluations.push({ index, field_name: fieldSpec.field_name, claim, result });
  }

  const fields = buildFieldResult(packet, evaluations);
  return finalizeOutput({
    declassification_schema_version: R5_VERSIONS.declassified,
    lane_id: packet.lane_id,
    supplier_id: packet.supplier_id,
    worker_output_state: "EVALUATED",
    field_statuses: fields.statuses,
    verified_claims: fields.verifiedClaims,
    unknown_fields: fields.unknownFields,
    blocked_fields: fields.blockedFields,
    conflicts: fields.conflicts,
    rejected_proposals: fields.rejected,
  });
}

export function validateDeclassifiedOutput(output) {
  requireObject(output, "declassified_output");
  exactKeys(output, OUTPUT_KEYS, "declassified_output");
  if (output.declassification_schema_version !== R5_VERSIONS.declassified) fail("OUTPUT_VERSION", "unsupported declassified output schema");
  requireString(output.lane_id, "declassified_output.lane_id", 512);
  requireString(output.supplier_id, "declassified_output.supplier_id", 256);
  if (!["REJECTED", "EVALUATED"].includes(output.worker_output_state)) fail("OUTPUT_STATE", "invalid worker output state");
  for (const [index, field] of output.field_statuses.entries()) {
    requireObject(field, `declassified_output.field_statuses[${index}]`);
    exactKeys(field, FIELD_STATUS_KEYS, `declassified_output.field_statuses[${index}]`);
    requireString(field.field_name, "field_name", 100);
    requireBoolean(field.required, "required");
    if (!Object.values(FIELD_STATUS).includes(field.status)) fail("FIELD_STATUS", "invalid declassified field status");
    requireString(field.reason, "reason", 100);
  }
  if (!Array.isArray(output.verified_claims) || !Array.isArray(output.unknown_fields) || !Array.isArray(output.blocked_fields) || !Array.isArray(output.conflicts) || !Array.isArray(output.rejected_proposals)) fail("OUTPUT_ARRAY", "declassified collections must be arrays");
  for (const [index, claim] of output.verified_claims.entries()) {
    requireObject(claim, `declassified_output.verified_claims[${index}]`);
    exactKeys(claim, VERIFIED_CLAIM_KEYS, `declassified_output.verified_claims[${index}]`);
    requireString(claim.field_name, "verified_claim.field_name", 100);
    requireDigest(claim.evidence_record_digest, "verified_claim.evidence_record_digest");
    requireDigest(claim.source_snapshot_digest, "verified_claim.source_snapshot_digest");
  }
  for (const [index, item] of output.rejected_proposals.entries()) {
    requireObject(item, `declassified_output.rejected_proposals[${index}]`);
    exactKeys(item, REJECTION_KEYS, `declassified_output.rejected_proposals[${index}]`);
    requireInteger(item.index, `declassified_output.rejected_proposals[${index}].index`);
    requireString(item.code, `declassified_output.rejected_proposals[${index}].code`, 100);
  }
  requireDigest(output.declassification_digest, "declassified_output.declassification_digest");
  const expected = sha256Canonical({ ...output, declassification_digest: null });
  if (expected !== output.declassification_digest) fail("OUTPUT_DIGEST_MISMATCH", "declassified output digest mismatch");
  return true;
}

export function outputContainsAny(output, needles) {
  const serialized = JSON.stringify(output);
  return needles.filter((needle) => typeof needle === "string" && needle.length > 0 && serialized.includes(needle));
}

export { OUTPUT_KEYS };
