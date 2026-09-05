import {
  sha256Canonical,
  validateSourceSnapshot,
} from "../evidence/adapter-evidence.mjs";
import {
  ATTRIBUTION_STATES,
  OBSERVATION_ROLES,
  attributeReceiptToSupplier,
  createRecipientObservation,
  validateRecipientObservation,
} from "../evidence/recipient-evidence.mjs";

export const R5_VERSIONS = Object.freeze({
  packet: "r5.lane-packet.v1",
  shareability: "r5.shareability.v1",
  task: "r5.extraction-task.v1",
  proposal: "r5.worker-proposal.v1",
  declassified: "r5.declassified-evidence.v1",
});

export const INPUT_CLASSES = Object.freeze({
  COMMON_SHAREABLE: "COMMON_SHAREABLE",
  SUPPLIER_PRIVATE_SELF: "SUPPLIER_PRIVATE_SELF",
  BUYER_PRIVATE: "BUYER_PRIVATE",
  OTHER_SUPPLIER_PRIVATE: "OTHER_SUPPLIER_PRIVATE",
  CONTROL_AUTHORITY: "CONTROL_AUTHORITY",
  EFFECT_SECRET: "EFFECT_SECRET",
  SYSTEM_INTERNAL: "SYSTEM_INTERNAL",
});

export const SHAREABILITY_POLICY = Object.freeze({
  [INPUT_CLASSES.COMMON_SHAREABLE]: "PACKET_ELIGIBLE",
  [INPUT_CLASSES.SUPPLIER_PRIVATE_SELF]: "PACKET_ELIGIBLE",
  [INPUT_CLASSES.BUYER_PRIVATE]: "FORBIDDEN",
  [INPUT_CLASSES.OTHER_SUPPLIER_PRIVATE]: "FORBIDDEN",
  [INPUT_CLASSES.CONTROL_AUTHORITY]: "MINIMUM_COMPILED_SCHEMA_ONLY",
  [INPUT_CLASSES.EFFECT_SECRET]: "FORBIDDEN",
  [INPUT_CLASSES.SYSTEM_INTERNAL]: "FORBIDDEN",
});

export const FIELD_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  UNKNOWN: "UNKNOWN",
  CONFLICT: "CONFLICT",
  BLOCKED: "BLOCKED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

const PACKET_KEYS = Object.freeze([
  "packet_schema_version",
  "packet_type",
  "lane_id",
  "sourcing_id",
  "round_id",
  "manifest_revision",
  "manifest_digest",
  "supplier_id",
  "supplier_identity",
  "supplier_attribution_context",
  "common_field_schema",
  "source_snapshots",
  "extraction_task",
  "trust_labels",
  "packet_digest",
]);

const SUPPLIER_IDENTITY_KEYS = Object.freeze([
  "supplier_id",
  "declared_contacts",
  "identity_ref",
  "attribution_state",
]);

const FIELD_SPEC_KEYS = Object.freeze([
  "field_name",
  "required",
  "type",
  "unit",
  "currency",
]);

const TASK_KEYS = Object.freeze([
  "task_type",
  "allowed_field_names",
  "required_field_names",
  "proposal_schema_version",
]);

const TRUST_LABEL_KEYS = Object.freeze([
  "receipt",
  "content",
  "attribution",
  "worker_output",
  "packet_scope",
]);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const FIELD_NAMES = new Set(["price", "delivery_days", "payment_terms", "no_revision"]);
const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "oauth",
  "token",
  "mcp",
  "send_email",
  "reply_to_email",
  "forward_email",
  "schedule_email_send",
  "save_draft",
  "approval",
  "approved",
  "buyer_reserve",
  "batna",
  "effect",
  "idempotency_key",
  "other_supplier_private",
  "competitor_evidence",
  "supplier_mailbox_id",
]);

export class R5ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R5ValidationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R5ValidationError(code, message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  return value;
}

function requireString(value, path, { max = 4096 } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail("INVALID_STRING", `${path} must be a non-empty bounded string`, { path });
  }
  return value;
}

function optionalString(value, path, { max = 4096 } = {}) {
  if (value === null || value === undefined) return null;
  return requireString(value, path, { max });
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") fail("INVALID_BOOLEAN", `${path} must be boolean`, { path });
  return value;
}

function requireInteger(value, path) {
  if (!Number.isSafeInteger(value)) fail("INVALID_INTEGER", `${path} must be a safe integer`, { path });
  return value;
}

function exactKeys(value, allowed, path) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("UNKNOWN_OR_MISSING_KEY", `${path} has an unexpected or missing key`, { path, actual, expected });
  }
}

function requiredKeys(value, required, path) {
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) fail("REQUIRED_KEY", `${path}.${key} is required`, { path: `${path}.${key}` });
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

function requireDigest(value, path) {
  requireString(value, path, { max: 64 });
  if (!DIGEST_RE.test(value)) fail("INVALID_DIGEST", `${path} must be lowercase SHA-256 hex`, { path });
  return value;
}

function requireId(value, path) {
  requireString(value, path, { max: 256 });
  if (!ID_RE.test(value)) fail("INVALID_ID", `${path} has an invalid stable identifier`, { path });
  return value;
}

function normalizeFieldSpec(raw, path) {
  requireObject(raw, path);
  exactKeys(raw, FIELD_SPEC_KEYS, path);
  requiredKeys(raw, FIELD_SPEC_KEYS, path);
  const field_name = requireString(raw.field_name, `${path}.field_name`, { max: 100 });
  if (!FIELD_NAMES.has(field_name)) fail("FIELD_NOT_SUPPORTED", `${path}.field_name is outside the R4 supported field surface`, { path: `${path}.field_name` });
  const type = requireString(raw.type, `${path}.type`, { max: 40 });
  const unit = optionalString(raw.unit, `${path}.unit`, { max: 40 });
  const currency = optionalString(raw.currency, `${path}.currency`, { max: 12 });
  return {
    field_name,
    required: requireBoolean(raw.required, `${path}.required`),
    type,
    unit,
    currency: currency === null ? null : currency.toUpperCase(),
  };
}

function normalizeFieldSchema(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) fail("FIELD_SCHEMA", "common_field_schema must be a bounded non-empty array");
  const result = raw.map((entry, index) => normalizeFieldSpec(entry, `common_field_schema[${index}]`));
  const names = new Set();
  for (const entry of result) {
    if (names.has(entry.field_name)) fail("DUPLICATE_FIELD", `duplicate field ${entry.field_name}`);
    names.add(entry.field_name);
  }
  return result.sort((left, right) => left.field_name.localeCompare(right.field_name));
}

function validateSupplierContext(context, supplierId) {
  requireObject(context, "supplier_attribution_context");
  const contextKeys = ["attribution_schema_version", "sourcing_id", "manifest_revision", "manifest_digest", "supplier_id", "declared_contacts", "identity_ref", "context_digest"];
  exactKeys(context, contextKeys, "supplier_attribution_context");
  requiredKeys(context, contextKeys, "supplier_attribution_context");
  if (context.supplier_id !== supplierId) fail("SUPPLIER_CONTEXT_MISMATCH", "supplier context does not belong to packet supplier");
  requireString(context.attribution_schema_version, "supplier_attribution_context.attribution_schema_version", { max: 100 });
  requireId(context.sourcing_id, "supplier_attribution_context.sourcing_id");
  requireInteger(context.manifest_revision, "supplier_attribution_context.manifest_revision");
  requireDigest(context.manifest_digest, "supplier_attribution_context.manifest_digest");
  requireId(context.supplier_id, "supplier_attribution_context.supplier_id");
  if (!Array.isArray(context.declared_contacts) || context.declared_contacts.length === 0 || context.declared_contacts.length > 8) fail("CONTACTS", "supplier attribution contacts must be bounded and non-empty");
  context.declared_contacts.forEach((value, index) => requireString(value, `supplier_attribution_context.declared_contacts[${index}]`, { max: 320 }));
  optionalString(context.identity_ref, "supplier_attribution_context.identity_ref", { max: 500 });
  requireDigest(context.context_digest, "supplier_attribution_context.context_digest");
  const withoutDigest = { ...context };
  delete withoutDigest.context_digest;
  if (sha256Canonical(withoutDigest) !== context.context_digest) fail("CONTEXT_DIGEST_MISMATCH", "supplier attribution context digest mismatch");
}

function normalizeTask(raw, fields) {
  const allowedNames = fields.map((field) => field.field_name).sort();
  const requiredNames = fields.filter((field) => field.required).map((field) => field.field_name).sort();
  const task = raw ?? {
    task_type: "EXTRACT_EXACT_R4_FIELDS",
    allowed_field_names: allowedNames,
    required_field_names: requiredNames,
    proposal_schema_version: R5_VERSIONS.proposal,
  };
  requireObject(task, "extraction_task");
  exactKeys(task, TASK_KEYS, "extraction_task");
  requiredKeys(task, TASK_KEYS, "extraction_task");
  if (task.task_type !== "EXTRACT_EXACT_R4_FIELDS") fail("TASK_TYPE", "unsupported extraction task");
  requireString(task.proposal_schema_version, "extraction_task.proposal_schema_version", { max: 100 });
  if (task.proposal_schema_version !== R5_VERSIONS.proposal) fail("TASK_SCHEMA", "task proposal schema does not match R5");
  if (!Array.isArray(task.allowed_field_names) || !Array.isArray(task.required_field_names)) fail("TASK_FIELDS", "task field lists must be arrays");
  if (JSON.stringify([...task.allowed_field_names].sort()) !== JSON.stringify(allowedNames)) fail("TASK_ALLOWED_FIELDS", "task allowed fields differ from field schema");
  if (JSON.stringify([...task.required_field_names].sort()) !== JSON.stringify(requiredNames)) fail("TASK_REQUIRED_FIELDS", "task required fields differ from field schema");
  return {
    task_type: task.task_type,
    allowed_field_names: allowedNames,
    required_field_names: requiredNames,
    proposal_schema_version: task.proposal_schema_version,
  };
}

function scanForbiddenKeys(value, path = "$") {
  if (!value || typeof value !== "object") return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) hits.push(`${path}.${key}`);
    hits.push(...scanForbiddenKeys(child, `${path}.${key}`));
  }
  return hits;
}

function assertForbiddenStrings(value, forbiddenStrings) {
  const serialized = JSON.stringify(value);
  const hits = forbiddenStrings.filter((needle) => typeof needle === "string" && needle.length > 0 && serialized.includes(needle));
  if (hits.length) fail("FORBIDDEN_VALUE", "packet contains a forbidden value canary", { count: hits.length });
}

function validateSnapshotSet(sourceSnapshots, supplierContext, supplierId) {
  if (!Array.isArray(sourceSnapshots) || sourceSnapshots.length === 0 || sourceSnapshots.length > 16) fail("SOURCE_SET", "source_snapshots must be a bounded non-empty array");
  const seen = new Set();
  const normalized = sourceSnapshots.map((snapshot, index) => {
    try {
      validateSourceSnapshot(snapshot);
    } catch (error) {
      fail("SOURCE_INVALID", `source_snapshots[${index}] is not a valid R4 snapshot`, { cause: error?.code ?? "R4_VALIDATION" });
    }
    const digest = snapshot.source_snapshot_digest;
    if (seen.has(digest)) fail("DUPLICATE_SOURCE", `source snapshot ${digest} appears more than once`);
    seen.add(digest);
    const observation = createRecipientObservation({ source_snapshot: snapshot, observation_role: OBSERVATION_ROLES.BUYER_RECEIVED });
    const attribution = attributeReceiptToSupplier(observation, supplierContext);
    if (attribution.state !== ATTRIBUTION_STATES.MATCH) fail("SOURCE_SUPPLIER_MISMATCH", `source snapshot ${digest} is not attributed to this supplier`);
    return clone(snapshot);
  });
  return normalized.sort((left, right) => left.source_snapshot_digest.localeCompare(right.source_snapshot_digest));
}

function normalizedIdentity({ supplier_id, supplier_context, attribution_state }) {
  const result = {
    supplier_id,
    declared_contacts: [...supplier_context.declared_contacts].sort(),
    identity_ref: supplier_context.identity_ref ?? null,
    attribution_state,
  };
  exactKeys(result, SUPPLIER_IDENTITY_KEYS, "supplier_identity");
  return result;
}

function normalizedTrustLabels() {
  const result = {
    receipt: "MERMAIL_BUYER_MAILBOX_OBSERVATION",
    content: "UNTRUSTED_CONTENT",
    attribution: "DECLARED_CONTACT_MATCH_NOT_AUTHENTICATION",
    worker_output: "UNTRUSTED_PROPOSAL_REQUIRES_R4_REVERIFICATION",
    packet_scope: "ONE_SUPPLIER_ONLY",
  };
  exactKeys(result, TRUST_LABEL_KEYS, "trust_labels");
  return result;
}

export function compileLanePacket({
  sourcing_id,
  round_id,
  manifest_revision,
  manifest_digest,
  supplier_id,
  supplier_attribution_context,
  common_field_schema,
  source_snapshots,
  extraction_task,
  forbidden_strings = [],
}) {
  const normalizedSourcingId = requireId(sourcing_id, "sourcing_id");
  const normalizedRoundId = requireId(round_id, "round_id");
  const normalizedManifestRevision = requireInteger(manifest_revision, "manifest_revision");
  const normalizedManifestDigest = requireDigest(manifest_digest, "manifest_digest");
  const normalizedSupplierId = requireId(supplier_id, "supplier_id");
  validateSupplierContext(supplier_attribution_context, normalizedSupplierId);
  if (supplier_attribution_context.sourcing_id !== normalizedSourcingId) fail("SOURCING_CONTEXT_MISMATCH", "supplier context sourcing_id differs");
  if (supplier_attribution_context.manifest_revision !== normalizedManifestRevision) fail("REVISION_CONTEXT_MISMATCH", "supplier context manifest revision differs");
  if (supplier_attribution_context.manifest_digest !== normalizedManifestDigest) fail("MANIFEST_CONTEXT_MISMATCH", "supplier context manifest digest differs");
  const fields = normalizeFieldSchema(common_field_schema);
  const snapshots = validateSnapshotSet(source_snapshots, supplier_attribution_context, normalizedSupplierId);
  const task = normalizeTask(extraction_task, fields);
  const packet = {
    packet_schema_version: R5_VERSIONS.packet,
    packet_type: "ONE_SUPPLIER_UNTRUSTED_INTERPRETATION",
    lane_id: `${normalizedRoundId}::${normalizedSupplierId}`,
    sourcing_id: normalizedSourcingId,
    round_id: normalizedRoundId,
    manifest_revision: normalizedManifestRevision,
    manifest_digest: normalizedManifestDigest,
    supplier_id: normalizedSupplierId,
    supplier_identity: normalizedIdentity({
      supplier_id: normalizedSupplierId,
      supplier_context: supplier_attribution_context,
      attribution_state: "MANIFEST_BOUND_DECLARED_CONTACT",
    }),
    supplier_attribution_context: clone(supplier_attribution_context),
    common_field_schema: fields,
    source_snapshots: snapshots,
    extraction_task: task,
    trust_labels: normalizedTrustLabels(),
    packet_digest: null,
  };
  const keyHits = scanForbiddenKeys(packet);
  if (keyHits.length) fail("FORBIDDEN_PACKET_KEY", "packet contains a forbidden authority/effect key", { count: keyHits.length });
  assertForbiddenStrings(packet, forbidden_strings);
  packet.packet_digest = sha256Canonical({ ...packet, packet_digest: null });
  return validateLanePacket(packet, { forbiddenStrings: forbidden_strings });
}

export function validateLanePacket(packet, { foreignSupplierIds = [], forbiddenStrings = [] } = {}) {
  requireObject(packet, "lane_packet");
  exactKeys(packet, PACKET_KEYS, "lane_packet");
  requiredKeys(packet, PACKET_KEYS, "lane_packet");
  if (packet.packet_schema_version !== R5_VERSIONS.packet) fail("PACKET_VERSION", "unsupported R5 packet schema");
  if (packet.packet_type !== "ONE_SUPPLIER_UNTRUSTED_INTERPRETATION") fail("PACKET_TYPE", "unexpected R5 packet type");
  requireId(packet.lane_id, "lane_packet.lane_id");
  requireId(packet.sourcing_id, "lane_packet.sourcing_id");
  requireId(packet.round_id, "lane_packet.round_id");
  requireInteger(packet.manifest_revision, "lane_packet.manifest_revision");
  requireDigest(packet.manifest_digest, "lane_packet.manifest_digest");
  requireId(packet.supplier_id, "lane_packet.supplier_id");
  if (packet.lane_id !== `${packet.round_id}::${packet.supplier_id}`) fail("LANE_ID_DERIVATION", "lane_id is not derived from round and supplier");
  validateSupplierContext(packet.supplier_attribution_context, packet.supplier_id);
  if (packet.supplier_attribution_context.sourcing_id !== packet.sourcing_id || packet.supplier_attribution_context.manifest_revision !== packet.manifest_revision || packet.supplier_attribution_context.manifest_digest !== packet.manifest_digest) fail("PACKET_CONTEXT_ANCESTRY", "packet attribution context does not match packet ancestry");
  requireObject(packet.supplier_identity, "lane_packet.supplier_identity");
  exactKeys(packet.supplier_identity, SUPPLIER_IDENTITY_KEYS, "lane_packet.supplier_identity");
  requiredKeys(packet.supplier_identity, SUPPLIER_IDENTITY_KEYS, "lane_packet.supplier_identity");
  if (packet.supplier_identity.supplier_id !== packet.supplier_id) fail("IDENTITY_SUPPLIER_MISMATCH", "supplier identity differs from packet supplier");
  if (packet.supplier_identity.attribution_state !== "MANIFEST_BOUND_DECLARED_CONTACT") fail("IDENTITY_STATE", "unexpected supplier identity state");
  normalizeFieldSchema(packet.common_field_schema);
  normalizeTask(packet.extraction_task, packet.common_field_schema);
  validateSnapshotSet(packet.source_snapshots, packet.supplier_attribution_context, packet.supplier_id);
  requireObject(packet.trust_labels, "lane_packet.trust_labels");
  exactKeys(packet.trust_labels, TRUST_LABEL_KEYS, "lane_packet.trust_labels");
  requiredKeys(packet.trust_labels, TRUST_LABEL_KEYS, "lane_packet.trust_labels");
  if (packet.trust_labels.packet_scope !== "ONE_SUPPLIER_ONLY") fail("PACKET_SCOPE", "packet scope label is not one-supplier");
  requireDigest(packet.packet_digest, "lane_packet.packet_digest");
  const expectedDigest = sha256Canonical({ ...packet, packet_digest: null });
  if (expectedDigest !== packet.packet_digest) fail("PACKET_DIGEST_MISMATCH", "lane packet digest mismatch");
  const serialized = JSON.stringify(packet);
  for (const foreign of foreignSupplierIds) if (typeof foreign === "string" && foreign.length > 0 && serialized.includes(foreign)) fail("FOREIGN_SUPPLIER_LEAK", "lane packet contains foreign supplier data");
  assertForbiddenStrings(packet, forbiddenStrings);
  return deepFreeze(clone(packet));
}

export function packetContainsAny(packet, needles) {
  const serialized = JSON.stringify(packet);
  return needles.filter((needle) => typeof needle === "string" && needle.length > 0 && serialized.includes(needle));
}

export function fieldSpecFor(packet, fieldName) {
  validateLanePacket(packet);
  return packet.common_field_schema.find((field) => field.field_name === fieldName) ?? null;
}

export { PACKET_KEYS, FIELD_SPEC_KEYS };
