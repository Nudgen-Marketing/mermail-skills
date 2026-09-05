import { createHash } from "node:crypto";

export const AUTHORITY = Object.freeze({
  BUYER_CONTROL: "BUYER_CONTROL",
  SUPPLIER_EVIDENCE: "SUPPLIER_EVIDENCE",
  SYSTEM_DERIVED: "SYSTEM_DERIVED",
  OPERATOR_CORRECTION: "OPERATOR_CORRECTION",
  UNTRUSTED_CONTENT: "UNTRUSTED_CONTENT",
});

export const ROUND_TYPES = Object.freeze({
  INITIAL: "INITIAL",
  FINAL_REVISION: "FINAL_REVISION",
});

const MANIFEST_SCHEMA_VERSION = "r3.v1";
const ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const REF_PATTERN = /^[a-z][a-z0-9._-]{2,95}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FIELD_TYPES = new Set(["string", "integer", "number", "boolean", "date", "money", "duration"]);
const CONSTRAINT_OPERATORS = new Set(["eq", "neq", "lt", "lte", "gt", "gte"]);
const DIRECTIONS = new Set(["minimize", "maximize"]);
const RESPONSE_STATUSES = new Set(["RESPONDED", "NO_RESPONSE", "WITHDRAWN", "UNKNOWN"]);
const ROUND_STATUSES = new Set([
  "DRAFT",
  "FROZEN",
  "OPEN",
  "CLOSED",
  "FINAL_REVISION_OPEN",
  "FINAL_REVISION_CLOSED",
]);
const PACKET_KEYS = [
  "packet_type",
  "lane_id",
  "supplier_id",
  "recipient_address",
  "identity_ref",
  "common_core_digest",
  "manifest_revision",
  "manifest_digest",
  "round_id",
  "round_type",
  "common_core",
  "packet_id",
  "packet_digest",
];
const TRUSTED_MANIFESTS = new WeakSet();
const TRUSTED_STATES = new WeakSet();

const ROOT_KEYS = [
  "manifest_schema_version",
  "sourcing_id",
  "manifest_revision",
  "created_at",
  "buyer_authority_ref",
  "supplier_roster",
  "common_requirements",
  "hard_must_haves",
  "decision_attributes",
  "normalization_policy",
  "deadline_policy",
  "late_evidence_policy",
  "round_sequence_policy",
  "revision_policy",
  "clarification_disclosure_policy",
  "no_deal_policy_ref",
  "approval_policy_ref",
];

export class R3ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "R3ValidationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R3ValidationError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  return value;
}

function requireArray(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    fail("INVALID_ARRAY", `${path} must be an array with at least ${min} item(s)`, { path });
  }
  return value;
}

function exactKeys(value, allowed, path) {
  requireObject(value, path);
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s): ${unknown.join(", ")}`, { path, unknown });
  return value;
}

function requiredKeys(value, required, path) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("MISSING_FIELD", `${path}.${key} is required`, { path: `${path}.${key}` });
    }
  }
}

function requireString(value, path, { min = 1, max = 4096 } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    fail("INVALID_STRING", `${path} must be a string of length ${min}..${max}`, { path });
  }
  return value.normalize("NFC");
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") fail("INVALID_BOOLEAN", `${path} must be boolean`, { path });
  return value;
}

function requireInteger(value, path, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("INVALID_INTEGER", `${path} must be a safe integer in ${min}..${max}`, { path });
  }
  return value;
}

function requireRef(value, path) {
  const normalized = requireString(value, path, { min: 3, max: 96 });
  if (!REF_PATTERN.test(normalized)) fail("INVALID_REFERENCE", `${path} is not a valid reference`, { path });
  return normalized;
}

function requireId(value, path) {
  const normalized = requireString(value, path, { min: 3, max: 64 });
  if (!ID_PATTERN.test(normalized)) fail("INVALID_ID", `${path} must match ${ID_PATTERN}`, { path });
  return normalized;
}

function requireEmail(value, path) {
  const normalized = requireString(value, path, { min: 3, max: 320 }).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) fail("INVALID_EMAIL", `${path} must be an email address`, { path });
  return normalized;
}

function requireUtcTimestamp(value, path) {
  const normalized = requireString(value, path, { min: 20, max: 24 });
  if (!UTC_PATTERN.test(normalized)) {
    fail("INVALID_TIMESTAMP", `${path} must be an explicit UTC timestamp ending in Z`, { path });
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) fail("INVALID_TIMESTAMP", `${path} is not a real timestamp`, { path });
  return date.toISOString();
}

function optionalUtcTimestamp(value, path) {
  if (value === undefined) return undefined;
  return requireUtcTimestamp(value, path);
}

function requireEnum(value, path, allowed) {
  const normalized = requireString(value, path);
  if (!allowed.has(normalized)) fail("INVALID_ENUM", `${path} must be one of ${[...allowed].join(", ")}`, { path });
  return normalized;
}

function normalizeUnit(value, path) {
  const normalized = requireString(value, path, { min: 1, max: 32 }).trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(normalized)) fail("INVALID_UNIT", `${path} must be a simple unit token`, { path });
  return normalized;
}

function normalizeCurrency(value, path) {
  const normalized = requireString(value, path, { min: 3, max: 3 }).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) fail("INVALID_CURRENCY", `${path} must be an ISO-like three-letter currency code`, { path });
  return normalized;
}

function normalizeNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("INVALID_NUMBER", `${path} must be finite`, { path });
  return Object.is(value, -0) ? 0 : value;
}

function normalizeConstraintValue(value, path, type) {
  if (type === "integer") return requireInteger(value, path);
  if (type === "number" || type === "money") return normalizeNumber(value, path);
  if (type === "boolean") return requireBoolean(value, path);
  if (type === "date") return requireUtcTimestamp(value, path);
  return requireString(value, path);
}

function normalizeFieldSpec(raw, path) {
  exactKeys(raw, ["name", "type", "unit", "currency"], path);
  requiredKeys(raw, ["name", "type"], path);
  const name = requireId(raw.name, `${path}.name`);
  const type = requireEnum(raw.type, `${path}.type`, FIELD_TYPES);
  const result = { name, type };
  if (raw.unit !== undefined) result.unit = normalizeUnit(raw.unit, `${path}.unit`);
  if (raw.currency !== undefined) result.currency = normalizeCurrency(raw.currency, `${path}.currency`);
  if (type === "money" && result.currency === undefined) fail("MISSING_CURRENCY", `${path}.currency is required for money fields`, { path });
  if (type === "duration" && result.unit === undefined) fail("MISSING_UNIT", `${path}.unit is required for duration fields`, { path });
  return result;
}

function normalizeHardConstraint(raw, path, fields) {
  exactKeys(raw, ["field", "operator", "value", "unit", "currency"], path);
  requiredKeys(raw, ["field", "operator", "value"], path);
  const field = requireId(raw.field, `${path}.field`);
  const fieldSpec = fields.get(field);
  if (!fieldSpec) fail("UNKNOWN_FIELD_REFERENCE", `${path}.field references ${field}`, { path, field });
  const operator = requireEnum(raw.operator, `${path}.operator`, CONSTRAINT_OPERATORS);
  const value = normalizeConstraintValue(raw.value, `${path}.value`, fieldSpec.type);
  const result = { field, operator, value };
  if (raw.unit !== undefined) result.unit = normalizeUnit(raw.unit, `${path}.unit`);
  if (raw.currency !== undefined) result.currency = normalizeCurrency(raw.currency, `${path}.currency`);
  if (fieldSpec.type === "money" && result.currency !== fieldSpec.currency) {
    fail("CURRENCY_POLICY_MISMATCH", `${path}.currency must match the field currency`, { path });
  }
  if (fieldSpec.unit !== undefined && result.unit !== fieldSpec.unit) {
    fail("UNIT_POLICY_MISMATCH", `${path}.unit must match the field unit`, { path });
  }
  return result;
}

function normalizeDecisionAttribute(raw, path, fields) {
  exactKeys(raw, ["field", "direction"], path);
  requiredKeys(raw, ["field", "direction"], path);
  const field = requireId(raw.field, `${path}.field`);
  if (!fields.has(field)) fail("UNKNOWN_FIELD_REFERENCE", `${path}.field references ${field}`, { path, field });
  return { field, direction: requireEnum(raw.direction, `${path}.direction`, DIRECTIONS) };
}

function normalizeNormalizationPolicy(raw, path, fields) {
  exactKeys(raw, ["field", "unit", "currency"], path);
  requiredKeys(raw, ["field", "unit"], path);
  const field = requireId(raw.field, `${path}.field`);
  const fieldSpec = fields.get(field);
  if (!fieldSpec) fail("UNKNOWN_FIELD_REFERENCE", `${path}.field references ${field}`, { path, field });
  const result = { field, unit: normalizeUnit(raw.unit, `${path}.unit`) };
  if (raw.currency !== undefined) result.currency = normalizeCurrency(raw.currency, `${path}.currency`);
  if (fieldSpec.type === "money" && result.currency !== fieldSpec.currency) {
    fail("CURRENCY_POLICY_MISMATCH", `${path}.currency must match the field currency`, { path });
  }
  return result;
}

function normalizeManifestInternal(raw) {
  exactKeys(raw, ROOT_KEYS, "manifest");
  requiredKeys(raw, ROOT_KEYS, "manifest");

  const manifest_schema_version = requireString(raw.manifest_schema_version, "manifest.manifest_schema_version", { min: 5, max: 16 });
  if (manifest_schema_version !== MANIFEST_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA", `manifest.manifest_schema_version must be ${MANIFEST_SCHEMA_VERSION}`, { expected: MANIFEST_SCHEMA_VERSION });
  }
  const sourcing_id = requireId(raw.sourcing_id, "manifest.sourcing_id");
  const manifest_revision = requireInteger(raw.manifest_revision, "manifest.manifest_revision", { min: 1, max: 1_000_000 });
  const created_at = requireUtcTimestamp(raw.created_at, "manifest.created_at");
  const buyer_authority_ref = requireRef(raw.buyer_authority_ref, "manifest.buyer_authority_ref");

  const rosterInput = requireArray(raw.supplier_roster, "manifest.supplier_roster", { min: 2 });
  const roster = rosterInput.map((supplier, index) => {
    const path = `manifest.supplier_roster[${index}]`;
    exactKeys(supplier, ["supplier_id", "address", "identity_ref"], path);
    requiredKeys(supplier, ["supplier_id", "address", "identity_ref"], path);
    return {
      supplier_id: requireId(supplier.supplier_id, `${path}.supplier_id`),
      address: requireEmail(supplier.address, `${path}.address`),
      identity_ref: requireRef(supplier.identity_ref, `${path}.identity_ref`),
    };
  }).sort((a, b) => stableStringCompare(a.supplier_id, b.supplier_id));
  const supplierIds = new Set();
  const supplierAddresses = new Set();
  for (const supplier of roster) {
    if (supplierIds.has(supplier.supplier_id)) fail("DUPLICATE_SUPPLIER_ID", `duplicate supplier_id ${supplier.supplier_id}`);
    if (supplierAddresses.has(supplier.address)) fail("DUPLICATE_SUPPLIER_ADDRESS", `duplicate supplier address ${supplier.address}`);
    supplierIds.add(supplier.supplier_id);
    supplierAddresses.add(supplier.address);
  }

  const fieldsInput = requireArray(raw.common_requirements, "manifest.common_requirements", { min: 1 });
  const fields = fieldsInput.map((field, index) => normalizeFieldSpec(field, `manifest.common_requirements[${index}]`)).sort((a, b) => stableStringCompare(a.name, b.name));
  const fieldMap = new Map();
  for (const field of fields) {
    if (fieldMap.has(field.name)) fail("DUPLICATE_FIELD", `duplicate requirement field ${field.name}`);
    fieldMap.set(field.name, field);
  }

  const hard_must_haves = requireArray(raw.hard_must_haves, "manifest.hard_must_haves").map((item, index) => normalizeHardConstraint(item, `manifest.hard_must_haves[${index}]`, fieldMap));
  const decision_attributes = requireArray(raw.decision_attributes, "manifest.decision_attributes", { min: 1 }).map((item, index) => normalizeDecisionAttribute(item, `manifest.decision_attributes[${index}]`, fieldMap));
  const normalization_policy = requireArray(raw.normalization_policy, "manifest.normalization_policy").map((item, index) => normalizeNormalizationPolicy(item, `manifest.normalization_policy[${index}]`, fieldMap));

  const deadlineInput = raw.deadline_policy;
  exactKeys(deadlineInput, ["initial_cutoff_at", "final_cutoff_at", "cutoff_inclusive", "timezone"], "manifest.deadline_policy");
  requiredKeys(deadlineInput, ["initial_cutoff_at", "cutoff_inclusive", "timezone"], "manifest.deadline_policy");
  const deadline_policy = {
    initial_cutoff_at: requireUtcTimestamp(deadlineInput.initial_cutoff_at, "manifest.deadline_policy.initial_cutoff_at"),
    cutoff_inclusive: requireBoolean(deadlineInput.cutoff_inclusive, "manifest.deadline_policy.cutoff_inclusive"),
    timezone: requireString(deadlineInput.timezone, "manifest.deadline_policy.timezone", { min: 3, max: 3 }),
  };
  if (deadline_policy.timezone !== "UTC") fail("UNSUPPORTED_TIMEZONE", "manifest.deadline_policy.timezone must be UTC", { path: "manifest.deadline_policy.timezone" });
  if (deadlineInput.final_cutoff_at !== undefined) {
    deadline_policy.final_cutoff_at = requireUtcTimestamp(deadlineInput.final_cutoff_at, "manifest.deadline_policy.final_cutoff_at");
  }

  const late_evidence_policy = requireEnum(raw.late_evidence_policy, "manifest.late_evidence_policy", new Set(["preserve_as_late"]));

  const sequenceInput = raw.round_sequence_policy;
  exactKeys(sequenceInput, ["final_revision_enabled", "max_final_revision_rounds", "final_eligibility_rule"], "manifest.round_sequence_policy");
  requiredKeys(sequenceInput, ["final_revision_enabled", "max_final_revision_rounds", "final_eligibility_rule"], "manifest.round_sequence_policy");
  const final_revision_enabled = requireBoolean(sequenceInput.final_revision_enabled, "manifest.round_sequence_policy.final_revision_enabled");
  const max_final_revision_rounds = requireInteger(sequenceInput.max_final_revision_rounds, "manifest.round_sequence_policy.max_final_revision_rounds", { min: 0, max: 1 });
  if ((final_revision_enabled && max_final_revision_rounds !== 1) || (!final_revision_enabled && max_final_revision_rounds !== 0)) {
    fail("FINAL_POLICY_MISMATCH", "final revision enabled must match a maximum of exactly one round", { path: "manifest.round_sequence_policy" });
  }
  if (final_revision_enabled && deadline_policy.final_cutoff_at === undefined) {
    fail("MISSING_FINAL_CUTOFF", "a final revision requires deadline_policy.final_cutoff_at", { path: "manifest.deadline_policy.final_cutoff_at" });
  }
  const round_sequence_policy = {
    final_revision_enabled,
    max_final_revision_rounds,
    final_eligibility_rule: requireEnum(sequenceInput.final_eligibility_rule, "manifest.round_sequence_policy.final_eligibility_rule", new Set(["responded_on_time_not_withdrawn"])),
  };

  const revisionInput = raw.revision_policy;
  exactKeys(revisionInput, ["amendment_mode", "protected_after_initial_open"], "manifest.revision_policy");
  requiredKeys(revisionInput, ["amendment_mode", "protected_after_initial_open"], "manifest.revision_policy");
  const revision_policy = {
    amendment_mode: requireEnum(revisionInput.amendment_mode, "manifest.revision_policy.amendment_mode", new Set(["append_only"])),
    protected_after_initial_open: requireBoolean(revisionInput.protected_after_initial_open, "manifest.revision_policy.protected_after_initial_open"),
  };

  const result = {
    manifest_schema_version,
    sourcing_id,
    manifest_revision,
    created_at,
    buyer_authority_ref,
    supplier_roster: roster,
    common_requirements: fields,
    hard_must_haves: hard_must_haves.sort(compareCanonical),
    decision_attributes: decision_attributes.sort((a, b) => stableStringCompare(a.field, b.field)),
    normalization_policy: normalization_policy.sort((a, b) => stableStringCompare(a.field, b.field)),
    deadline_policy,
    late_evidence_policy,
    round_sequence_policy,
    revision_policy,
    clarification_disclosure_policy: requireEnum(raw.clarification_disclosure_policy, "manifest.clarification_disclosure_policy", new Set(["lane_only"])),
    no_deal_policy_ref: requireRef(raw.no_deal_policy_ref, "manifest.no_deal_policy_ref"),
    approval_policy_ref: requireRef(raw.approval_policy_ref, "manifest.approval_policy_ref"),
  };
  for (const attribute of result.decision_attributes) {
    if (result.decision_attributes.filter((candidate) => candidate.field === attribute.field).length > 1) fail("DUPLICATE_DECISION_ATTRIBUTE", `duplicate decision field ${attribute.field}`);
  }
  for (const item of result.normalization_policy) {
    if (result.normalization_policy.filter((candidate) => candidate.field === item.field).length > 1) fail("DUPLICATE_NORMALIZATION_POLICY", `duplicate normalization field ${item.field}`);
  }
  return result;
}

export function normalizeManifest(raw) {
  return normalizeManifestInternal(raw);
}

function normalizeOrigin(raw, allowedKinds = new Set(Object.values(AUTHORITY)), path = "origin") {
  exactKeys(raw, ["kind", "reference"], path);
  requiredKeys(raw, ["kind", "reference"], path);
  const kind = requireEnum(raw.kind, `${path}.kind`, allowedKinds);
  return { kind, reference: requireRef(raw.reference, `${path}.reference`) };
}

function normalizeApproval(raw, expectedAction, manifest, digest, { predecessorDigest, changedFields } = {}) {
  exactKeys(raw, [
    "action",
    "purpose",
    "origin",
    "sourcing_id",
    "manifest_revision",
    "manifest_digest",
    "approver_ref",
    "approved_at",
    "expires_at",
    "predecessor_manifest_digest",
    "changed_fields",
  ], "approval");
  requiredKeys(raw, ["action", "purpose", "origin", "sourcing_id", "manifest_revision", "manifest_digest", "approver_ref", "approved_at"], "approval");
  if (raw.action !== expectedAction) fail("APPROVAL_ACTION_MISMATCH", `approval.action must be ${expectedAction}`);
  const origin = normalizeOrigin(raw.origin, new Set([AUTHORITY.BUYER_CONTROL]), "approval.origin");
  if (origin.reference !== manifest.buyer_authority_ref) fail("AUTHORITY_REFERENCE_MISMATCH", "approval origin does not match manifest buyer authority", { expected: manifest.buyer_authority_ref, actual: origin.reference });
  if (raw.sourcing_id !== manifest.sourcing_id) fail("APPROVAL_SOURCING_MISMATCH", "approval sourcing_id does not match manifest");
  if (raw.manifest_revision !== manifest.manifest_revision) fail("APPROVAL_REVISION_MISMATCH", "approval manifest_revision does not match manifest");
  const approvalDigest = requireString(raw.manifest_digest, "approval.manifest_digest", { min: 64, max: 64 });
  if (!/^[a-f0-9]{64}$/.test(approvalDigest)) fail("INVALID_DIGEST", "approval.manifest_digest must be a lowercase SHA-256 hex digest");
  if (approvalDigest !== digest) fail("APPROVAL_DIGEST_MISMATCH", "approval manifest_digest does not match canonical manifest digest", { expected: digest, actual: approvalDigest });
  const result = {
    action: expectedAction,
    purpose: requireString(raw.purpose, "approval.purpose", { min: 3, max: 256 }),
    origin,
    sourcing_id: manifest.sourcing_id,
    manifest_revision: manifest.manifest_revision,
    manifest_digest: approvalDigest,
    approver_ref: requireRef(raw.approver_ref, "approval.approver_ref"),
    approved_at: requireUtcTimestamp(raw.approved_at, "approval.approved_at"),
  };
  const expires_at = optionalUtcTimestamp(raw.expires_at, "approval.expires_at");
  if (expires_at !== undefined) {
    if (expires_at <= result.approved_at) fail("INVALID_APPROVAL_EXPIRY", "approval.expires_at must be after approved_at");
    result.expires_at = expires_at;
  }
  if (expectedAction === "amend_manifest") {
    requiredKeys(raw, ["predecessor_manifest_digest", "changed_fields"], "approval");
    const predecessor = requireString(raw.predecessor_manifest_digest, "approval.predecessor_manifest_digest", { min: 64, max: 64 });
    if (!/^[a-f0-9]{64}$/.test(predecessor)) fail("INVALID_DIGEST", "approval.predecessor_manifest_digest must be a lowercase SHA-256 hex digest");
    if (predecessor !== predecessorDigest) fail("PREDECESSOR_DIGEST_MISMATCH", "approval predecessor digest does not match the prior frozen manifest");
    result.predecessor_manifest_digest = predecessorDigest;
    const expectedFields = [...changedFields].sort();
    if (!Array.isArray(raw.changed_fields) || raw.changed_fields.some((item) => typeof item !== "string")) fail("INVALID_CHANGED_FIELDS", "approval.changed_fields must be string paths");
    const actualFields = [...new Set(raw.changed_fields)].sort();
    if (actualFields.length !== raw.changed_fields.length || JSON.stringify(actualFields) !== JSON.stringify(expectedFields)) {
      fail("CHANGED_FIELDS_MISMATCH", "approval.changed_fields must exactly match the canonical manifest diff", { expected: expectedFields, actual: raw.changed_fields });
    }
    result.changed_fields = actualFields;
  } else if (raw.predecessor_manifest_digest !== undefined || raw.changed_fields !== undefined) {
    fail("UNEXPECTED_REVISION_FIELDS", "freeze approval cannot carry amendment fields");
  }
  return result;
}

function assertFrozenManifest(value, path = "frozenManifest") {
  requireObject(value, path);
  if (!TRUSTED_MANIFESTS.has(value)) fail("UNTRUSTED_FROZEN_MANIFEST", `${path} was not constructed by the R3 kernel in this process`);
  exactKeys(value, ["type", "manifest", "manifest_digest", "manifest_identity", "approval", "authority", "predecessor_manifest_digest"], path);
  requiredKeys(value, ["type", "manifest", "manifest_digest", "manifest_identity", "approval", "authority"], path);
  if (value.type !== "FROZEN_MANIFEST") fail("INVALID_FROZEN_MANIFEST", `${path}.type must be FROZEN_MANIFEST`);
  const normalized = normalizeManifest(value.manifest);
  const digest = sha256Canonical(normalized);
  if (digest !== value.manifest_digest) fail("FROZEN_DIGEST_MISMATCH", `${path}.manifest_digest does not match manifest`, { expected: digest, actual: value.manifest_digest });
  if (value.manifest_identity !== `${normalized.sourcing_id}-manifest-${normalized.manifest_revision}`) fail("MANIFEST_IDENTITY_MISMATCH", "manifest identity is not derived from sourcing_id/revision");
  const authority = normalizeOrigin(value.authority, new Set([AUTHORITY.BUYER_CONTROL]), `${path}.authority`);
  if (authority.reference !== normalized.buyer_authority_ref) fail("AUTHORITY_REFERENCE_MISMATCH", "frozen manifest authority reference does not match manifest");
  if (value.predecessor_manifest_digest !== undefined && !/^[a-f0-9]{64}$/.test(value.predecessor_manifest_digest)) fail("INVALID_DIGEST", "predecessor_manifest_digest must be a lowercase SHA-256 hex digest");
  if (value.approval?.action === "freeze_manifest") {
    normalizeApproval(value.approval, "freeze_manifest", normalized, digest);
  } else if (value.approval?.action === "amend_manifest") {
    normalizeApproval(value.approval, "amend_manifest", normalized, digest, {
      predecessorDigest: value.predecessor_manifest_digest,
      changedFields: value.approval.changed_fields ?? [],
    });
  } else {
    fail("INVALID_APPROVAL", `${path}.approval must be a freeze_manifest or amend_manifest approval`);
  }
  if (value.approval.action === "amend_manifest" && value.predecessor_manifest_digest !== value.approval.predecessor_manifest_digest) fail("PREDECESSOR_DIGEST_MISMATCH", "frozen predecessor digest does not match approval");
  return value;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function canonicalize(value) {
  return serializeCanonical(value);
}

function serializeCanonical(value) {
  if (value === undefined) fail("UNDEFINED_CANONICAL_VALUE", "undefined cannot be canonicalized");
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_CANONICAL_NUMBER", "non-finite number cannot be canonicalized");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") fail("INVALID_CANONICAL_TYPE", `cannot canonicalize ${typeof value}`);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  if (!isPlainObject(value)) fail("INVALID_CANONICAL_OBJECT", "only plain objects can be canonicalized");
  const normalizedKeys = new Map();
  for (const key of Object.keys(value)) {
    const normalizedKey = key.normalize("NFC");
    if (normalizedKeys.has(normalizedKey)) fail("CANONICAL_KEY_COLLISION", "object keys collide after NFC normalization", { key, normalizedKey });
    normalizedKeys.set(normalizedKey, key);
  }
  return `{${[...normalizedKeys.keys()].sort().map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[normalizedKeys.get(key)])}`).join(",")}}`;
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), "utf8");
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

function compareCanonical(a, b) {
  return stableStringCompare(canonicalize(a), canonicalize(b));
}

function stableStringCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clone(value) {
  return structuredClone(value);
}

function diffPaths(previous, next, path = "") {
  if (canonicalize(previous) === canonicalize(next)) return [];
  if (Array.isArray(previous) || Array.isArray(next) || !isPlainObject(previous) || !isPlainObject(next)) return [path || "/"];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const paths = [];
  for (const key of [...keys].sort()) {
    const childPath = `${path}/${key}`;
    if (!(key in previous) || !(key in next)) paths.push(childPath);
    else paths.push(...diffPaths(previous[key], next[key], childPath));
  }
  return paths.length ? paths : [path || "/"];
}

function assertControlOrigin(origin, manifest, allowedKinds = new Set([AUTHORITY.BUYER_CONTROL, AUTHORITY.SYSTEM_DERIVED, AUTHORITY.OPERATOR_CORRECTION])) {
  const normalized = normalizeOrigin(origin, allowedKinds);
  if (normalized.kind === AUTHORITY.BUYER_CONTROL && normalized.reference !== manifest.buyer_authority_ref) {
    fail("AUTHORITY_REFERENCE_MISMATCH", "Buyer control origin does not match the manifest authority");
  }
  return normalized;
}

function assertApprovalUsable(approval, at) {
  const instant = requireUtcTimestamp(at, "at");
  if (approval.expires_at !== undefined && instant >= approval.expires_at) fail("APPROVAL_EXPIRED", "approval is expired at the requested operation time");
  return true;
}

export function freezeManifest(rawManifest, rawApproval) {
  const manifest = normalizeManifest(rawManifest);
  const digest = sha256Canonical(manifest);
  const approval = normalizeApproval(rawApproval, "freeze_manifest", manifest, digest);
  const result = deepFreeze({
    type: "FROZEN_MANIFEST",
    manifest,
    manifest_digest: digest,
    manifest_identity: `${manifest.sourcing_id}-manifest-${manifest.manifest_revision}`,
    approval,
    authority: { kind: AUTHORITY.BUYER_CONTROL, reference: manifest.buyer_authority_ref },
  });
  TRUSTED_MANIFESTS.add(result);
  return result;
}

export function createManifestRevision(previousFrozenManifest, rawNextManifest, rawApproval) {
  assertFrozenManifest(previousFrozenManifest);
  const next = normalizeManifest(rawNextManifest);
  if (next.sourcing_id !== previousFrozenManifest.manifest.sourcing_id) fail("SOURCING_ID_IMMUTABLE", "a manifest revision cannot change sourcing_id");
  if (next.manifest_revision !== previousFrozenManifest.manifest.manifest_revision + 1) fail("REVISION_SEQUENCE_ERROR", "manifest_revision must increment by exactly one");
  // The revision counter is sequencing metadata, not a buyer policy field. It
  // is validated separately and must not dilute the exact amendment paths.
  const changedFields = diffPaths(previousFrozenManifest.manifest, next).filter((path) => path !== "/manifest_revision");
  if (changedFields.length === 0) fail("EMPTY_REVISION", "a manifest revision must change at least one field");
  const digest = sha256Canonical(next);
  const approval = normalizeApproval(rawApproval, "amend_manifest", next, digest, {
    predecessorDigest: previousFrozenManifest.manifest_digest,
    changedFields,
  });
  const result = deepFreeze({
    type: "FROZEN_MANIFEST",
    manifest: next,
    manifest_digest: digest,
    manifest_identity: `${next.sourcing_id}-manifest-${next.manifest_revision}`,
    approval,
    authority: { kind: AUTHORITY.BUYER_CONTROL, reference: next.buyer_authority_ref },
    predecessor_manifest_digest: previousFrozenManifest.manifest_digest,
  });
  TRUSTED_MANIFESTS.add(result);
  return result;
}

function assertRoundState(value, path = "roundState") {
  requireObject(value, path);
  if (!TRUSTED_STATES.has(value)) fail("UNTRUSTED_ROUND_STATE", `${path} was not constructed by the R3 kernel in this process`);
  if (value.type !== "ROUND_STATE") fail("INVALID_ROUND_STATE", `${path}.type must be ROUND_STATE`);
  if (!ROUND_STATUSES.has(value.status)) fail("INVALID_ROUND_STATUS", `${path}.status is not supported`);
  for (const key of ["sourcing_id", "round_id", "round_type", "manifest_revision", "manifest_digest", "opened_at", "deadline_policy", "lanes", "state_digest"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail("MISSING_ROUND_FIELD", `${path}.${key} is required`);
  }
  if (!Object.values(ROUND_TYPES).includes(value.round_type)) fail("INVALID_ROUND_TYPE", `${path}.round_type is not supported`);
  if (sha256Canonical(stripStateDigest(value)) !== value.state_digest) fail("ROUND_STATE_DIGEST_MISMATCH", `${path}.state_digest does not match state`);
  return value;
}

function stripStateDigest(state) {
  const copy = clone(state);
  delete copy.state_digest;
  return copy;
}

function finalizeState(state) {
  const result = clone(state);
  result.state_digest = sha256Canonical(result);
  const frozen = deepFreeze(result);
  TRUSTED_STATES.add(frozen);
  return frozen;
}

function deriveRoundId(sourcingId, roundType) {
  if (roundType === ROUND_TYPES.INITIAL) return `${sourcingId}-initial-1`;
  if (roundType === ROUND_TYPES.FINAL_REVISION) return `${sourcingId}-final-revision-1`;
  fail("INVALID_ROUND_TYPE", `unsupported round type ${roundType}`);
}

function deriveLaneId(roundId, supplierId) {
  return `${roundId}-${supplierId}`;
}

function assertRoundIdAvailable(roundId, knownRounds = []) {
  if (!Array.isArray(knownRounds)) fail("INVALID_KNOWN_ROUNDS", "known_rounds must be an array");
  for (const [index, known] of knownRounds.entries()) {
    requireObject(known, `known_rounds[${index}]`);
    if (known.round_id === roundId) fail("ROUND_ID_REUSE", `round_id ${roundId} already exists in the supplied trusted round set`);
  }
}

function cutoffFor(manifest, roundType) {
  const cutoff = roundType === ROUND_TYPES.INITIAL
    ? manifest.deadline_policy.initial_cutoff_at
    : manifest.deadline_policy.final_cutoff_at;
  if (cutoff === undefined) fail("MISSING_ROUND_CUTOFF", `${roundType} has no declared cutoff`);
  return cutoff;
}

export function deriveLateStatus(observedAt, cutoffAt, cutoffInclusive = false) {
  if (observedAt === undefined || observedAt === null) return "UNKNOWN";
  const observed = requireUtcTimestamp(observedAt, "observed_at");
  const cutoff = requireUtcTimestamp(cutoffAt, "cutoff_at");
  if (observed < cutoff) return "ON_TIME";
  if (observed === cutoff) return cutoffInclusive ? "ON_TIME" : "LATE";
  return "LATE";
}

function validateObservation(raw, path, supplierIds, manifest, roundType) {
  exactKeys(raw, ["supplier_id", "response_status", "response_at", "origin", "source_ref"], path);
  requiredKeys(raw, ["supplier_id", "response_status", "origin"], path);
  const supplier_id = requireId(raw.supplier_id, `${path}.supplier_id`);
  if (!supplierIds.has(supplier_id)) fail("UNKNOWN_SUPPLIER", `${path}.supplier_id is not in the frozen roster`, { supplier_id });
  const response_status = requireEnum(raw.response_status, `${path}.response_status`, RESPONSE_STATUSES);
  exactKeys(raw.origin, ["kind", "reference", "verification"], `${path}.origin`);
  requiredKeys(raw.origin, ["kind", "reference", "verification"], `${path}.origin`);
  const origin = normalizeOrigin({ kind: raw.origin.kind, reference: raw.origin.reference }, new Set([AUTHORITY.SUPPLIER_EVIDENCE]), `${path}.origin`);
  if (raw.origin.verification !== "UNVERIFIED_STUB") fail("UNVERIFIED_STUB_REQUIRED", `${path}.origin.verification must be UNVERIFIED_STUB for R3 observation inputs`);
  const response_at = optionalUtcTimestamp(raw.response_at, `${path}.response_at`);
  if (response_status === "RESPONDED" && response_at === undefined) fail("MISSING_RESPONSE_TIMESTAMP", `${path}.response_at is required for RESPONDED`);
  if (response_status !== "RESPONDED" && response_at !== undefined) fail("UNEXPECTED_RESPONSE_TIMESTAMP", `${path}.response_at is only valid for RESPONDED`);
  const result = { supplier_id, response_status, origin };
  if (response_at !== undefined) {
    result.response_at = response_at;
    result.late_status = deriveLateStatus(response_at, cutoffFor(manifest, roundType), manifest.deadline_policy.cutoff_inclusive);
  } else {
    result.late_status = "UNKNOWN";
  }
  if (raw.source_ref !== undefined) result.source_ref = requireRef(raw.source_ref, `${path}.source_ref`);
  return result;
}

function laneStatusFromObservation(observation) {
  const eligible = observation.response_status === "RESPONDED" && observation.late_status === "ON_TIME";
  return {
    supplier_id: observation.supplier_id,
    response_status: observation.response_status,
    late_status: observation.late_status,
    final_revision_allowed: eligible,
    observation_origin: { kind: AUTHORITY.SUPPLIER_EVIDENCE, verification: "UNVERIFIED_STUB", reference: observation.origin.reference },
    ...(observation.response_at === undefined ? {} : { response_at: observation.response_at }),
    ...(observation.source_ref === undefined ? {} : { source_ref: observation.source_ref }),
  };
}

export function openInitialRound(frozenManifest, { opened_at, origin, known_rounds = [] }) {
  assertFrozenManifest(frozenManifest);
  const manifest = frozenManifest.manifest;
  const controlOrigin = assertControlOrigin(origin, manifest, new Set([AUTHORITY.BUYER_CONTROL]));
  const openedAt = requireUtcTimestamp(opened_at, "opened_at");
  assertApprovalUsable(frozenManifest.approval, openedAt);
  if (openedAt < manifest.created_at || openedAt < frozenManifest.approval.approved_at) fail("INVALID_OPEN_TIME", "INITIAL cannot open before manifest creation/approval");
  if (openedAt >= cutoffFor(manifest, ROUND_TYPES.INITIAL)) fail("ROUND_OPEN_AFTER_CUTOFF", "INITIAL cannot open at or after its cutoff");
  const round_id = deriveRoundId(manifest.sourcing_id, ROUND_TYPES.INITIAL);
  assertRoundIdAvailable(round_id, known_rounds);
  const lanes = manifest.supplier_roster.map((supplier) => ({
    supplier_id: supplier.supplier_id,
    address: supplier.address,
    identity_ref: supplier.identity_ref,
    lane_id: deriveLaneId(round_id, supplier.supplier_id),
    response_status: "UNKNOWN",
    late_status: "UNKNOWN",
    final_revision_allowed: false,
  }));
  return finalizeState({
    type: "ROUND_STATE",
    status: "OPEN",
    sourcing_id: manifest.sourcing_id,
    round_id,
    round_type: ROUND_TYPES.INITIAL,
    manifest_revision: manifest.manifest_revision,
    manifest_digest: frozenManifest.manifest_digest,
    deadline_policy: manifest.deadline_policy,
    opened_at: openedAt,
    opened_by: controlOrigin,
    lanes,
    predecessor: null,
    eligibility: null,
  });
}

export function closeInitialRound(initialState, { closed_at, observations, origin }) {
  assertRoundState(initialState);
  if (initialState.round_type !== ROUND_TYPES.INITIAL || initialState.status !== "OPEN") fail("INVALID_CLOSE_TRANSITION", "only an open INITIAL round can be closed");
  const controlOrigin = normalizeOrigin(origin, new Set([AUTHORITY.SYSTEM_DERIVED, AUTHORITY.OPERATOR_CORRECTION, AUTHORITY.BUYER_CONTROL]), "close.origin");
  const closedAt = requireUtcTimestamp(closed_at, "closed_at");
  if (closedAt < initialState.opened_at) fail("INVALID_CLOSE_TIME", "round cannot close before it opens");
  if (!Array.isArray(observations)) fail("INVALID_OBSERVATIONS", "observations must be an array");
  const supplierIds = new Set(initialState.lanes.map((lane) => lane.supplier_id));
  const manifestForCutoff = { deadline_policy: initialState.deadline_policy };
  const observationMap = new Map();
  for (const [index, observation] of observations.entries()) {
    const normalized = validateObservation(observation, `observations[${index}]`, supplierIds, manifestForCutoff, ROUND_TYPES.INITIAL);
    if (observationMap.has(normalized.supplier_id)) fail("DUPLICATE_OBSERVATION", `duplicate observation for ${normalized.supplier_id}`);
    observationMap.set(normalized.supplier_id, normalized);
  }
  if (observationMap.size !== supplierIds.size) fail("INCOMPLETE_OBSERVATIONS", "one observation is required for every frozen supplier lane");
  const lanes = initialState.lanes.map((lane) => laneStatusFromObservation(observationMap.get(lane.supplier_id)));
  const eligible_supplier_ids = lanes.filter((lane) => lane.final_revision_allowed).map((lane) => lane.supplier_id).sort();
  const eligibility = {
    rule: "responded_on_time_not_withdrawn",
    frozen_at: closedAt,
    eligible_supplier_ids,
    manifest_revision: initialState.manifest_revision,
    manifest_digest: initialState.manifest_digest,
  };
  eligibility.eligibility_digest = sha256Canonical(eligibility);
  return finalizeState({
    ...stripStateDigest(initialState),
    status: "CLOSED",
    closed_at: closedAt,
    closed_by: controlOrigin,
    lanes,
    eligibility,
  });
}

function validateStateAgainstManifest(state, frozenManifest) {
  assertRoundState(state);
  assertFrozenManifest(frozenManifest);
  if (state.sourcing_id !== frozenManifest.manifest.sourcing_id || state.manifest_revision !== frozenManifest.manifest.manifest_revision || state.manifest_digest !== frozenManifest.manifest_digest) {
    fail("MANIFEST_ANCESTRY_MISMATCH", "round state does not belong to the supplied frozen manifest");
  }
}

export function withdrawFinalEligibleSupplier(initialClosedState, supplierId, { at, origin }) {
  assertRoundState(initialClosedState);
  if (initialClosedState.round_type !== ROUND_TYPES.INITIAL || initialClosedState.status !== "CLOSED") fail("INVALID_WITHDRAWAL_TRANSITION", "withdrawal correction requires a closed INITIAL state");
  const normalizedSupplierId = requireId(supplierId, "supplier_id");
  const controlOrigin = normalizeOrigin(origin, new Set([AUTHORITY.BUYER_CONTROL, AUTHORITY.OPERATOR_CORRECTION]), "withdrawal.origin");
  const atValue = requireUtcTimestamp(at, "withdrawal.at");
  if (!initialClosedState.eligibility?.eligible_supplier_ids?.includes(normalizedSupplierId)) fail("SUPPLIER_NOT_ELIGIBLE", "supplier is not in the frozen final eligibility set");
  const eligible_supplier_ids = initialClosedState.eligibility.eligible_supplier_ids.filter((id) => id !== normalizedSupplierId);
  const withdrawals = [...(initialClosedState.eligibility.withdrawals ?? []), { supplier_id: normalizedSupplierId, at: atValue, origin: controlOrigin }].sort((a, b) => stableStringCompare(a.supplier_id, b.supplier_id));
  const eligibility = {
    ...initialClosedState.eligibility,
    eligible_supplier_ids,
    withdrawals,
    eligibility_revision: (initialClosedState.eligibility.eligibility_revision ?? 0) + 1,
  };
  delete eligibility.eligibility_digest;
  eligibility.eligibility_digest = sha256Canonical(eligibility);
  return finalizeState({ ...stripStateDigest(initialClosedState), eligibility });
}

export function openFinalRound(initialClosedState, frozenManifest, { opened_at, origin, known_rounds = [] }) {
  validateStateAgainstManifest(initialClosedState, frozenManifest);
  if (initialClosedState.round_type !== ROUND_TYPES.INITIAL || initialClosedState.status !== "CLOSED") fail("INVALID_FINAL_PREDECESSOR", "final round requires a CLOSED INITIAL predecessor");
  if (!initialClosedState.eligibility || !Array.isArray(initialClosedState.eligibility.eligible_supplier_ids)) fail("MISSING_ELIGIBILITY", "CLOSED INITIAL predecessor has no frozen eligibility result");
  if (!frozenManifest.manifest.round_sequence_policy.final_revision_enabled) fail("FINAL_ROUND_DISABLED", "manifest policy does not enable a final revision");
  const controlOrigin = assertControlOrigin(origin, frozenManifest.manifest, new Set([AUTHORITY.BUYER_CONTROL]));
  const openedAt = requireUtcTimestamp(opened_at, "opened_at");
  assertApprovalUsable(frozenManifest.approval, openedAt);
  if (openedAt < initialClosedState.closed_at) fail("INVALID_OPEN_TIME", "final round cannot open before INITIAL closes");
  if (openedAt >= cutoffFor(frozenManifest.manifest, ROUND_TYPES.FINAL_REVISION)) fail("ROUND_OPEN_AFTER_CUTOFF", "FINAL_REVISION cannot open at or after its cutoff");
  const round_id = deriveRoundId(frozenManifest.manifest.sourcing_id, ROUND_TYPES.FINAL_REVISION);
  assertRoundIdAvailable(round_id, known_rounds);
  const lanes = initialClosedState.eligibility.eligible_supplier_ids.map((supplierId) => {
    const supplier = frozenManifest.manifest.supplier_roster.find((candidate) => candidate.supplier_id === supplierId);
    if (!supplier) fail("ELIGIBILITY_ROSTER_MISMATCH", `eligible supplier ${supplierId} is absent from the manifest roster`);
    return {
      supplier_id: supplier.supplier_id,
      address: supplier.address,
      identity_ref: supplier.identity_ref,
      lane_id: deriveLaneId(round_id, supplier.supplier_id),
      response_status: "UNKNOWN",
      late_status: "UNKNOWN",
      final_revision_allowed: true,
    };
  });
  return finalizeState({
    type: "ROUND_STATE",
    status: "FINAL_REVISION_OPEN",
    sourcing_id: frozenManifest.manifest.sourcing_id,
    round_id,
    round_type: ROUND_TYPES.FINAL_REVISION,
    manifest_revision: frozenManifest.manifest.manifest_revision,
    manifest_digest: frozenManifest.manifest_digest,
    deadline_policy: frozenManifest.manifest.deadline_policy,
    opened_at: openedAt,
    opened_by: controlOrigin,
    lanes,
    predecessor: {
      round_id: initialClosedState.round_id,
      state_digest: initialClosedState.state_digest,
      manifest_revision: initialClosedState.manifest_revision,
      manifest_digest: initialClosedState.manifest_digest,
      eligibility_digest: initialClosedState.eligibility.eligibility_digest,
      eligible_supplier_ids: [...initialClosedState.eligibility.eligible_supplier_ids],
    },
    eligibility: initialClosedState.eligibility,
  });
}

export function closeFinalRound(finalState, { closed_at, observations, origin }) {
  assertRoundState(finalState);
  if (finalState.round_type !== ROUND_TYPES.FINAL_REVISION || finalState.status !== "FINAL_REVISION_OPEN") fail("INVALID_CLOSE_TRANSITION", "only an open FINAL_REVISION round can be closed");
  const closedAt = requireUtcTimestamp(closed_at, "closed_at");
  if (closedAt < finalState.opened_at) fail("INVALID_CLOSE_TIME", "final round cannot close before it opens");
  const closeOrigin = normalizeOrigin(origin, new Set([AUTHORITY.SYSTEM_DERIVED, AUTHORITY.OPERATOR_CORRECTION, AUTHORITY.BUYER_CONTROL]), "close.origin");
  const supplierIds = new Set(finalState.lanes.map((lane) => lane.supplier_id));
  const manifestForCutoff = { deadline_policy: finalState.deadline_policy };
  const observationMap = new Map();
  for (const [index, observation] of (observations ?? []).entries()) {
    const normalized = validateObservation(observation, `observations[${index}]`, supplierIds, manifestForCutoff, ROUND_TYPES.FINAL_REVISION);
    if (observationMap.has(normalized.supplier_id)) fail("DUPLICATE_OBSERVATION", `duplicate observation for ${normalized.supplier_id}`);
    observationMap.set(normalized.supplier_id, normalized);
  }
  if (observationMap.size !== supplierIds.size) fail("INCOMPLETE_OBSERVATIONS", "one observation is required for every final-round lane");
  const lanes = finalState.lanes.map((lane) => laneStatusFromObservation(observationMap.get(lane.supplier_id)));
  return finalizeState({ ...stripStateDigest(finalState), status: "FINAL_REVISION_CLOSED", closed_at: closedAt, closed_by: closeOrigin, lanes });
}

function commonCoreFor(frozenManifest, roundState) {
  validateStateAgainstManifest(roundState, frozenManifest);
  const manifest = frozenManifest.manifest;
  const core = {
    protocol: "mermail-evidence-bound-competitive-sourcing-round",
    manifest_schema_version: manifest.manifest_schema_version,
    sourcing_id: manifest.sourcing_id,
    manifest_revision: manifest.manifest_revision,
    manifest_digest: frozenManifest.manifest_digest,
    round_id: roundState.round_id,
    round_type: roundState.round_type,
    common_requirements: manifest.common_requirements,
    hard_must_haves: manifest.hard_must_haves,
    decision_attributes: manifest.decision_attributes,
    normalization_policy: manifest.normalization_policy,
    deadline_policy: manifest.deadline_policy,
    late_evidence_policy: manifest.late_evidence_policy,
    clarification_disclosure_policy: manifest.clarification_disclosure_policy,
    round_policy: manifest.round_sequence_policy,
  };
  if (roundState.round_type === ROUND_TYPES.FINAL_REVISION) {
    core.predecessor = {
      round_id: roundState.predecessor.round_id,
      state_digest: roundState.predecessor.state_digest,
      manifest_revision: roundState.predecessor.manifest_revision,
      manifest_digest: roundState.predecessor.manifest_digest,
      eligibility_digest: roundState.predecessor.eligibility_digest,
    };
  }
  return core;
}

export function compileCommonPacket(frozenManifest, roundState) {
  const common_core = commonCoreFor(frozenManifest, roundState);
  const common_core_digest = sha256Canonical(common_core);
  return deepFreeze({
    packet_type: "COMMON",
    sourcing_id: frozenManifest.manifest.sourcing_id,
    round_id: roundState.round_id,
    round_type: roundState.round_type,
    manifest_revision: frozenManifest.manifest.manifest_revision,
    manifest_digest: frozenManifest.manifest_digest,
    common_core,
    common_core_digest,
  });
}

export function compileSupplierPacket(frozenManifest, roundState, supplierId) {
  const commonPacket = compileCommonPacket(frozenManifest, roundState);
  const normalizedSupplierId = requireId(supplierId, "supplier_id");
  const supplier = frozenManifest.manifest.supplier_roster.find((candidate) => candidate.supplier_id === normalizedSupplierId);
  if (!supplier) fail("UNKNOWN_SUPPLIER", `supplier ${normalizedSupplierId} is not in the frozen roster`);
  const lane = roundState.lanes.find((candidate) => candidate.supplier_id === normalizedSupplierId);
  if (!lane) fail("SUPPLIER_NOT_IN_ROUND", `supplier ${normalizedSupplierId} is not in this round's frozen lane set`);
  if (roundState.round_type === ROUND_TYPES.FINAL_REVISION && !roundState.eligibility.eligible_supplier_ids.includes(normalizedSupplierId)) {
    fail("SUPPLIER_NOT_ELIGIBLE", `supplier ${normalizedSupplierId} is not eligible for the final round`);
  }
  const envelope = {
    packet_type: "LANE",
    lane_id: lane.lane_id,
    supplier_id: supplier.supplier_id,
    recipient_address: supplier.address,
    identity_ref: supplier.identity_ref,
    common_core_digest: commonPacket.common_core_digest,
  };
  return deepFreeze({
    ...envelope,
    manifest_revision: commonPacket.manifest_revision,
    manifest_digest: commonPacket.manifest_digest,
    round_id: commonPacket.round_id,
    round_type: commonPacket.round_type,
    common_core: commonPacket.common_core,
    common_core_digest: commonPacket.common_core_digest,
    packet_id: `${lane.lane_id}-${commonPacket.common_core_digest}`,
    packet_digest: sha256Canonical({ ...envelope, common_core: commonPacket.common_core }),
  });
}

export function verifyCommonCoreEquality(packets, frozenManifest, roundState) {
  if (!Array.isArray(packets) || packets.length < 2) fail("INSUFFICIENT_PACKETS", "at least two supplier packets are required for equal-treatment verification");
  const expected = compileCommonPacket(frozenManifest, roundState);
  const failures = [];
  const digests = new Set();
  for (const [index, packet] of packets.entries()) {
    if (!isPlainObject(packet)) {
      failures.push({ index, code: "INVALID_PACKET" });
      continue;
    }
    try {
      exactKeys(packet, PACKET_KEYS, `packets[${index}]`);
    } catch (error) {
      failures.push({ index, code: error instanceof R3ValidationError ? error.code : "INVALID_PACKET" });
      continue;
    }
    if (packet.common_core_digest !== expected.common_core_digest || sha256Canonical(packet.common_core) !== expected.common_core_digest) {
      failures.push({ index, code: "COMMON_CORE_DIGEST_MISMATCH" });
    }
    if (canonicalize(packet.common_core) !== canonicalize(expected.common_core)) failures.push({ index, code: "COMMON_CORE_CONTENT_MISMATCH" });
    if (packet.manifest_digest !== expected.manifest_digest || packet.manifest_revision !== expected.manifest_revision || packet.round_id !== expected.round_id || packet.round_type !== expected.round_type) {
      failures.push({ index, code: "PACKET_ANCESTRY_MISMATCH" });
    }
    try {
      const expectedPacket = compileSupplierPacket(frozenManifest, roundState, packet.supplier_id);
      if (canonicalize(packet) !== canonicalize(expectedPacket)) failures.push({ index, code: "PACKET_ENVELOPE_MISMATCH" });
    } catch (error) {
      failures.push({ index, code: error instanceof R3ValidationError ? error.code : "INVALID_PACKET" });
    }
    digests.add(packet.common_core_digest);
  }
  if (digests.size !== 1) failures.push({ code: "COMMON_CORE_NOT_EQUAL" });
  return Object.freeze({
    equal: failures.length === 0,
    expected_common_core_digest: expected.common_core_digest,
    failures,
  });
}

export function compileRound({ type, frozenManifest, initialState, opened_at, origin, known_rounds = [] }) {
  if (type === ROUND_TYPES.INITIAL) return openInitialRound(frozenManifest, { opened_at, origin, known_rounds });
  if (type === ROUND_TYPES.FINAL_REVISION) return openFinalRound(initialState, frozenManifest, { opened_at, origin, known_rounds });
  fail("INVALID_ROUND_TYPE", `unsupported round type ${type}`);
}

export function inspectRoundState(roundState) {
  assertRoundState(roundState);
  return Object.freeze({
    status: roundState.status,
    round_type: roundState.round_type,
    round_id: roundState.round_id,
    sourcing_id: roundState.sourcing_id,
    manifest_revision: roundState.manifest_revision,
    manifest_digest: roundState.manifest_digest,
    eligible_supplier_ids: roundState.eligibility?.eligible_supplier_ids ?? [],
    predecessor_state_digest: roundState.predecessor?.state_digest ?? null,
  });
}

export const r3Contract = Object.freeze({
  manifest_schema_version: MANIFEST_SCHEMA_VERSION,
  authority_classes: Object.values(AUTHORITY),
  round_types: Object.values(ROUND_TYPES),
  canonicalization: {
    object_keys: "lexicographic UTF-16 key order after NFC key normalization",
    arrays: "preserved by generic canonicalizer; semantic manifest sets are sorted during schema normalization",
    timestamps: "explicit UTC Z values normalized to ISO milliseconds",
    numbers: "finite JSON numbers; negative zero becomes zero",
    unicode: "NFC normalized strings",
    null: "preserved by generic canonicalizer; rejected by strict manifest schema because absent is the only optional representation",
    duplicate_entries: "duplicate supplier IDs/addresses, fields, decision attributes, policies, and observations fail",
  },
});
