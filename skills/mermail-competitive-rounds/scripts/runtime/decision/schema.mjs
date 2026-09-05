import {
  DIRECTIONS, EVIDENCE_STATES, FIELD_TYPES, R7_EVIDENCE_VERSION, R7_OFFER_VERSION, R7_VERSION,
  clone, digest, exactKeys, fail, freeze, integer, isPlainObject, money, recordDigest, requiredKeys, string, typedValue, utc,
} from "./core.mjs";
import { canonicalize, sha256Canonical } from "../authority/manifest-round-compiler.mjs";

const FIELD_KEYS = ["field_id", "type", "unit", "currency", "required", "direction", "normalization", "hard_constraints"];
const CONSTRAINT_KEYS = ["field_id", "operator", "value", "unit", "currency"];
const RESERVE_KEYS = ["private", "constraints"];
const POLICY_KEYS = ["policy_schema_version", "sourcing_id", "manifest_revision", "manifest_digest", "field_schema", "hard_constraints", "reserve_policy", "final_revision_policy", "tie_breaks", "no_deal_policy_ref"];
const EVIDENCE_KEYS = ["evidence_schema_version", "evidence_id", "field_id", "supplier_id", "sourcing_id", "round_id", "manifest_revision", "manifest_digest", "receipt_snapshot_digest", "buyer_mailbox_id", "buyer_email_id", "provider_message_id", "source_span", "raw_fragment", "normalized_value", "unit", "currency", "verification_state", "record_digest"];
const REF_KEYS = ["evidence_id", "record_digest", "receipt_snapshot_digest", "field_id", "supplier_id", "sourcing_id", "round_id", "manifest_revision", "manifest_digest"];
const FIELD_VALUE_KEYS = ["status", "value", "unit", "currency", "evidence_ref"];
const OFFER_KEYS = ["offer_schema_version", "supplier_id", "sourcing_id", "round_id", "manifest_revision", "manifest_digest", "revision_kind", "predecessor_offer_digest", "received_at", "eligibility_state", "fields", "offer_digest"];

function fieldById(policy, fieldId) {
  const field = policy.field_schema.find((candidate) => candidate.field_id === fieldId);
  if (!field) fail("UNKNOWN_FIELD", `field ${fieldId} is not in the frozen decision schema`, { fieldId });
  return field;
}

export function validateConstraint(raw, path = "constraint") {
  exactKeys(raw, CONSTRAINT_KEYS, path);
  requiredKeys(raw, CONSTRAINT_KEYS, path);
  string(raw.field_id, `${path}.field_id`, { max: 128 });
  string(raw.operator, `${path}.operator`, { max: 16 });
  if (!["LTE", "GTE", "EQ"].includes(raw.operator)) fail("UNSUPPORTED_CONSTRAINT", `${path}.operator is unsupported`, { path });
  if (raw.unit !== null) string(raw.unit, `${path}.unit`, { max: 32 });
  if (raw.currency !== null) string(raw.currency, `${path}.currency`, { max: 3 });
  return clone(raw);
}

export function validatePolicy(raw) {
  exactKeys(raw, POLICY_KEYS, "policy");
  requiredKeys(raw, POLICY_KEYS, "policy");
  if (raw.policy_schema_version !== `${R7_VERSION}.decision-policy`) fail("POLICY_VERSION", "unsupported R7 policy version");
  string(raw.sourcing_id, "policy.sourcing_id", { max: 256 });
  integer(raw.manifest_revision, "policy.manifest_revision", { min: 1 });
  digest(raw.manifest_digest, "policy.manifest_digest");
  if (!Array.isArray(raw.field_schema) || raw.field_schema.length === 0) fail("FIELD_SCHEMA_EMPTY", "policy field_schema must not be empty");
  const seen = new Set();
  for (const [index, field] of raw.field_schema.entries()) {
    const path = `policy.field_schema[${index}]`;
    exactKeys(field, FIELD_KEYS, path);
    requiredKeys(field, FIELD_KEYS, path);
    string(field.field_id, `${path}.field_id`, { max: 128 });
    if (seen.has(field.field_id)) fail("DUPLICATE_FIELD", `duplicate field ${field.field_id}`);
    seen.add(field.field_id);
    if (!FIELD_TYPES.includes(field.type)) fail("FIELD_TYPE", `${path}.type is unsupported`);
    if (field.unit !== null) string(field.unit, `${path}.unit`, { max: 32 });
    if (field.currency !== null) string(field.currency, `${path}.currency`, { max: 3 });
    if (field.type === "MONEY" && (!field.currency || field.unit !== "minor")) fail("MONEY_SCHEMA", `${path} money fields require minor unit and currency`);
    if (typeof field.required !== "boolean") fail("FIELD_REQUIRED", `${path}.required must be boolean`);
    if (!DIRECTIONS.includes(field.direction)) fail("FIELD_DIRECTION", `${path}.direction is unsupported`);
    string(field.normalization, `${path}.normalization`, { max: 128 });
    const expectedNormalization = field.type === "MONEY" ? "exact_minor_units" : "exact_typed_value";
    if (field.normalization !== expectedNormalization) fail("NORMALIZATION_POLICY", `${path}.normalization is not an explicit supported normalization`, { expected: expectedNormalization });
    if (!Array.isArray(field.hard_constraints)) fail("FIELD_CONSTRAINTS", `${path}.hard_constraints must be an array`);
    for (const [ci, constraint] of field.hard_constraints.entries()) {
      validateConstraint(constraint, `${path}.hard_constraints[${ci}]`);
      if (constraint.field_id !== field.field_id) fail("CONSTRAINT_FIELD", "field constraint must bind its containing field");
      typedValue(field.type, constraint.value, `${path}.hard_constraints[${ci}].value`, { unit: field.unit, currency: field.currency });
    }
  }
  if (!Array.isArray(raw.hard_constraints)) fail("HARD_CONSTRAINTS", "policy.hard_constraints must be an array");
  for (const [index, constraint] of raw.hard_constraints.entries()) {
    validateConstraint(constraint, `policy.hard_constraints[${index}]`);
    const field = fieldById(raw, constraint.field_id);
    typedValue(field.type, constraint.value, `policy.hard_constraints[${index}].value`, { unit: field.unit, currency: field.currency });
    if (constraint.unit !== field.unit || constraint.currency !== field.currency) fail("CONSTRAINT_UNIT", "hard constraint unit/currency must equal the field schema");
  }
  if (!isPlainObject(raw.reserve_policy)) fail("RESERVE_POLICY", "policy.reserve_policy must be an object");
  exactKeys(raw.reserve_policy, RESERVE_KEYS, "policy.reserve_policy");
  requiredKeys(raw.reserve_policy, RESERVE_KEYS, "policy.reserve_policy");
  if (raw.reserve_policy.private !== true) fail("RESERVE_NOT_PRIVATE", "reserve policy must be explicitly private");
  if (!Array.isArray(raw.reserve_policy.constraints) || raw.reserve_policy.constraints.length === 0) fail("RESERVE_EMPTY", "an explicit reserve is required");
  for (const [index, constraint] of raw.reserve_policy.constraints.entries()) {
    validateConstraint(constraint, `policy.reserve_policy.constraints[${index}]`);
    const field = fieldById(raw, constraint.field_id);
    typedValue(field.type, constraint.value, `policy.reserve_policy.constraints[${index}].value`, { unit: field.unit, currency: field.currency });
    if (constraint.unit !== field.unit || constraint.currency !== field.currency) fail("RESERVE_UNIT", "reserve unit/currency must equal the field schema");
  }
  if (!isPlainObject(raw.final_revision_policy)) fail("FINAL_POLICY", "policy.final_revision_policy must be an object");
  exactKeys(raw.final_revision_policy, ["enabled", "max_rounds", "cutoff_at", "cutoff_inclusive", "late_policy"], "policy.final_revision_policy");
  requiredKeys(raw.final_revision_policy, ["enabled", "max_rounds", "cutoff_at", "cutoff_inclusive", "late_policy"], "policy.final_revision_policy");
  if (raw.final_revision_policy.enabled !== true || raw.final_revision_policy.max_rounds !== 1) fail("FINAL_POLICY_SCOPE", "R7 supports exactly one final revision round");
  utc(raw.final_revision_policy.cutoff_at, "policy.final_revision_policy.cutoff_at");
  if (typeof raw.final_revision_policy.cutoff_inclusive !== "boolean") fail("FINAL_CUTOFF", "cutoff_inclusive must be boolean");
  if (raw.final_revision_policy.late_policy !== "preserve_as_late") fail("LATE_POLICY", "late policy must preserve late evidence");
  if (!Array.isArray(raw.tie_breaks) || raw.tie_breaks.length !== 0) fail("HIDDEN_TIE_BREAK", "R7 has no implicit tie-breaks");
  string(raw.no_deal_policy_ref, "policy.no_deal_policy_ref", { max: 256 });
  return true;
}

export function buildDecisionPolicy({ frozen_manifest, reserve_constraints }) {
  if (!isPlainObject(frozen_manifest) || frozen_manifest.type !== "FROZEN_MANIFEST") fail("MANIFEST_NOT_FROZEN", "R7 requires an R3 frozen manifest");
  const manifest = frozen_manifest.manifest;
  const requirements = new Map((manifest.common_requirements ?? []).map((item) => [item.name, item]));
  const hard = (manifest.hard_must_haves ?? []).map((item) => ({
    field_id: item.field,
    operator: String(item.operator).toUpperCase(),
    value: requirements.get(item.field)?.type === "money" ? { minor_units: item.value, currency: requirements.get(item.field).currency } : { integer: item.value },
    unit: item.unit ?? requirements.get(item.field)?.unit ?? null,
    currency: requirements.get(item.field)?.currency ?? null,
  }));
  const fields = (manifest.decision_attributes ?? []).map((attribute) => {
    const requirement = requirements.get(attribute.field);
    if (!requirement) fail("DECISION_FIELD_NOT_DECLARED", `decision field ${attribute.field} is absent from common_requirements`);
    const type = requirement.type === "integer" ? "INTEGER" : requirement.type === "money" ? "MONEY" : requirement.type === "duration" ? "DURATION" : "TEXT";
    return {
      field_id: attribute.field,
      type,
      unit: type === "MONEY" ? "minor" : requirement.unit ?? null,
      currency: requirement.currency ?? null,
      required: true,
      direction: String(attribute.direction).toUpperCase(),
      normalization: type === "MONEY" ? "exact_minor_units" : "exact_typed_value",
      hard_constraints: hard.filter((constraint) => constraint.field_id === attribute.field),
    };
  });
  const policy = {
    policy_schema_version: `${R7_VERSION}.decision-policy`,
    sourcing_id: manifest.sourcing_id,
    manifest_revision: manifest.manifest_revision,
    manifest_digest: frozen_manifest.manifest_digest,
    field_schema: fields,
    hard_constraints: hard,
    reserve_policy: { private: true, constraints: clone(reserve_constraints) },
    final_revision_policy: {
      enabled: manifest.round_sequence_policy.final_revision_enabled,
      max_rounds: manifest.round_sequence_policy.max_final_revision_rounds,
      cutoff_at: manifest.deadline_policy.final_cutoff_at,
      cutoff_inclusive: manifest.deadline_policy.cutoff_inclusive,
      late_policy: manifest.late_evidence_policy,
    },
    tie_breaks: [],
    no_deal_policy_ref: manifest.no_deal_policy_ref,
  };
  validatePolicy(policy);
  return freeze(policy);
}

export function buildEvidenceRecord(input) {
  const record = {
    evidence_schema_version: R7_EVIDENCE_VERSION,
    evidence_id: input.evidence_id,
    field_id: input.field_id,
    supplier_id: input.supplier_id,
    sourcing_id: input.sourcing_id,
    round_id: input.round_id,
    manifest_revision: input.manifest_revision,
    manifest_digest: input.manifest_digest,
    receipt_snapshot_digest: input.receipt_snapshot_digest,
    buyer_mailbox_id: input.buyer_mailbox_id,
    buyer_email_id: input.buyer_email_id,
    provider_message_id: input.provider_message_id ?? null,
    source_span: clone(input.source_span),
    raw_fragment: input.raw_fragment,
    normalized_value: clone(input.normalized_value),
    unit: input.unit ?? null,
    currency: input.currency ?? null,
    verification_state: input.verification_state ?? "VERIFIED",
    record_digest: null,
  };
  validateEvidenceRecord(record, { allowNullDigest: true });
  record.record_digest = recordDigest(record);
  return freeze(record);
}

export function validateEvidenceRecord(raw, { allowNullDigest = false } = {}) {
  exactKeys(raw, EVIDENCE_KEYS, "evidence");
  requiredKeys(raw, EVIDENCE_KEYS, "evidence");
  if (raw.evidence_schema_version !== R7_EVIDENCE_VERSION) fail("EVIDENCE_VERSION", "unsupported R7 evidence version");
  string(raw.evidence_id, "evidence.evidence_id", { max: 256 });
  string(raw.field_id, "evidence.field_id", { max: 128 });
  string(raw.supplier_id, "evidence.supplier_id", { max: 256 });
  string(raw.sourcing_id, "evidence.sourcing_id", { max: 256 });
  string(raw.round_id, "evidence.round_id", { max: 256 });
  integer(raw.manifest_revision, "evidence.manifest_revision", { min: 1 });
  digest(raw.manifest_digest, "evidence.manifest_digest");
  digest(raw.receipt_snapshot_digest, "evidence.receipt_snapshot_digest");
  string(raw.buyer_mailbox_id, "evidence.buyer_mailbox_id", { max: 256 });
  string(raw.buyer_email_id, "evidence.buyer_email_id", { max: 256 });
  if (raw.provider_message_id !== null) string(raw.provider_message_id, "evidence.provider_message_id", { max: 512 });
  if (!isPlainObject(raw.source_span)) fail("SOURCE_SPAN", "evidence.source_span must be an object");
  exactKeys(raw.source_span, ["start", "end", "occurrence", "content_hash"], "evidence.source_span");
  requiredKeys(raw.source_span, ["start", "end", "occurrence", "content_hash"], "evidence.source_span");
  integer(raw.source_span.start, "evidence.source_span.start", { min: 0 });
  integer(raw.source_span.end, "evidence.source_span.end", { min: 1 });
  integer(raw.source_span.occurrence, "evidence.source_span.occurrence", { min: 0 });
  if (raw.source_span.end <= raw.source_span.start) fail("SOURCE_SPAN_RANGE", "source span must have positive width");
  digest(raw.source_span.content_hash, "evidence.source_span.content_hash");
  string(raw.raw_fragment, "evidence.raw_fragment", { max: 4096 });
  if (!EVIDENCE_STATES.includes(raw.verification_state)) fail("EVIDENCE_STATE", "unsupported evidence state");
  if (raw.record_digest !== null || !allowNullDigest) {
    digest(raw.record_digest, "evidence.record_digest");
    if (raw.record_digest !== recordDigest(raw)) fail("EVIDENCE_DIGEST_MISMATCH", "evidence record digest mismatch");
  }
  return true;
}

export function buildEvidenceRef(record) {
  validateEvidenceRecord(record);
  return Object.freeze({
    evidence_id: record.evidence_id,
    record_digest: record.record_digest,
    receipt_snapshot_digest: record.receipt_snapshot_digest,
    field_id: record.field_id,
    supplier_id: record.supplier_id,
    sourcing_id: record.sourcing_id,
    round_id: record.round_id,
    manifest_revision: record.manifest_revision,
    manifest_digest: record.manifest_digest,
  });
}

function validateFieldValue(raw, field, path) {
  exactKeys(raw, FIELD_VALUE_KEYS, path);
  requiredKeys(raw, FIELD_VALUE_KEYS, path);
  if (!EVIDENCE_STATES.includes(raw.status)) fail("FIELD_STATE", `${path}.status is unsupported`);
  if (raw.status === "VERIFIED") {
    if (raw.value === null || raw.evidence_ref === null) fail("VERIFIED_MISSING_BINDING", `${path} verified value requires evidence_ref`);
    typedValue(field.type, raw.value, `${path}.value`, { unit: field.unit, currency: field.currency });
    if (raw.unit !== field.unit || raw.currency !== field.currency) fail("FIELD_UNIT", `${path} unit/currency differs from schema`);
    exactKeys(raw.evidence_ref, REF_KEYS, `${path}.evidence_ref`);
    requiredKeys(raw.evidence_ref, REF_KEYS, `${path}.evidence_ref`);
    digest(raw.evidence_ref.record_digest, `${path}.evidence_ref.record_digest`);
    digest(raw.evidence_ref.receipt_snapshot_digest, `${path}.evidence_ref.receipt_snapshot_digest`);
  } else if (raw.value !== null || raw.evidence_ref !== null) {
    fail("NONVERIFIED_VALUE", `${path} non-verified fields cannot carry a value or authority reference`);
  }
}

export function validateOffer(raw, policy, { allowNullDigest = false } = {}) {
  validatePolicy(policy);
  exactKeys(raw, OFFER_KEYS, "offer");
  requiredKeys(raw, OFFER_KEYS, "offer");
  if (raw.offer_schema_version !== R7_OFFER_VERSION) fail("OFFER_VERSION", "unsupported R7 offer version");
  string(raw.supplier_id, "offer.supplier_id", { max: 256 });
  string(raw.sourcing_id, "offer.sourcing_id", { max: 256 });
  string(raw.round_id, "offer.round_id", { max: 256 });
  integer(raw.manifest_revision, "offer.manifest_revision", { min: 1 });
  digest(raw.manifest_digest, "offer.manifest_digest");
  if (!['INITIAL', 'FINAL'].includes(raw.revision_kind)) fail("OFFER_REVISION_KIND", "offer revision_kind is unsupported");
  if (raw.predecessor_offer_digest !== null) digest(raw.predecessor_offer_digest, "offer.predecessor_offer_digest");
  if (raw.revision_kind === "INITIAL" && raw.predecessor_offer_digest !== null) fail("INITIAL_PREDECESSOR", "an INITIAL offer cannot have a predecessor");
  if (raw.revision_kind === "FINAL" && raw.predecessor_offer_digest === null) fail("FINAL_PREDECESSOR", "a FINAL offer must bind an INITIAL predecessor");
  utc(raw.received_at, "offer.received_at");
  if (!['ELIGIBLE', 'INELIGIBLE', 'WITHDRAWN'].includes(raw.eligibility_state)) fail("OFFER_ELIGIBILITY", "offer eligibility state is unsupported");
  if (!isPlainObject(raw.fields)) fail("OFFER_FIELDS", "offer.fields must be an object");
  for (const key of Object.keys(raw.fields)) fieldById(policy, key);
  for (const field of policy.field_schema) if (Object.prototype.hasOwnProperty.call(raw.fields, field.field_id)) validateFieldValue(raw.fields[field.field_id], field, `offer.fields.${field.field_id}`);
  if (raw.offer_digest !== null || !allowNullDigest) digest(raw.offer_digest, "offer.offer_digest");
  if (!allowNullDigest && raw.offer_digest !== sha256Canonical({ ...raw, offer_digest: null })) fail("OFFER_DIGEST_MISMATCH", "offer digest mismatch");
  return true;
}

export function buildOffer(input, policy) {
  const offer = {
    offer_schema_version: R7_OFFER_VERSION,
    supplier_id: input.supplier_id,
    sourcing_id: input.sourcing_id,
    round_id: input.round_id,
    manifest_revision: input.manifest_revision,
    manifest_digest: input.manifest_digest,
    revision_kind: input.revision_kind ?? "INITIAL",
    predecessor_offer_digest: input.predecessor_offer_digest ?? null,
    received_at: input.received_at,
    eligibility_state: input.eligibility_state ?? "ELIGIBLE",
    fields: clone(input.fields),
    offer_digest: null,
  };
  validateOffer(offer, policy, { allowNullDigest: true });
  offer.offer_digest = sha256Canonical(offer);
  validateOffer(offer, policy);
  return freeze(offer);
}

export function validateEvidenceBinding(record, offer, field) {
  validateEvidenceRecord(record);
  if (record.verification_state !== "VERIFIED") return { ok: false, reason: `evidence_state_${record.verification_state}` };
  const ref = offer.fields[field.field_id]?.evidence_ref;
  if (!ref) return { ok: false, reason: "missing_evidence_ref" };
  try { exactKeys(ref, REF_KEYS, "offer.evidence_ref"); } catch (error) { return { ok: false, reason: error.code ?? "invalid_evidence_ref" }; }
  const pairs = [
    [ref.evidence_id, record.evidence_id], [ref.record_digest, record.record_digest], [ref.receipt_snapshot_digest, record.receipt_snapshot_digest],
    [ref.field_id, field.field_id], [ref.supplier_id, offer.supplier_id], [ref.sourcing_id, offer.sourcing_id], [ref.round_id, offer.round_id],
    [ref.manifest_revision, offer.manifest_revision], [ref.manifest_digest, offer.manifest_digest],
    [record.field_id, field.field_id], [record.supplier_id, offer.supplier_id], [record.sourcing_id, offer.sourcing_id], [record.round_id, offer.round_id],
    [record.manifest_revision, offer.manifest_revision], [record.manifest_digest, offer.manifest_digest],
  ];
  if (pairs.some(([left, right]) => left !== right)) return { ok: false, reason: "authority_context_mismatch" };
  const fieldValue = offer.fields[field.field_id];
  if (canonicalize(fieldValue.value) !== canonicalize(record.normalized_value) || fieldValue.unit !== record.unit || fieldValue.currency !== record.currency) return { ok: false, reason: "normalized_value_mismatch" };
  return { ok: true };
}

export { FIELD_KEYS, CONSTRAINT_KEYS, EVIDENCE_KEYS, FIELD_VALUE_KEYS, OFFER_KEYS, POLICY_KEYS, REF_KEYS };
