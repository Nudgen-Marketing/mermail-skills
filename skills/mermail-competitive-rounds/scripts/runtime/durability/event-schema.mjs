import { artifactRef, validateArtifactReference, ARTIFACT_TYPES } from "./artifact-store.mjs";
import { canonicalize, sha256Canonical, isPlainObject, cloneJson } from "./canonical.mjs";
import { fail, R6Error } from "./errors.mjs";

export const R6_VERSIONS = Object.freeze({
  command: "r6.command.v1",
  event: "r6.event.v1",
  state: "r6.state.v1",
  checkpoint: "r6.checkpoint.v1",
  producer: "r6-journal.v1",
});

export const AUTHORITY_CLASSES = Object.freeze([
  "BUYER_CONTROL",
  "SUPPLIER_EVIDENCE",
  "SYSTEM_DERIVED",
  "OPERATOR_CORRECTION",
]);

export const EVENT_TYPES = Object.freeze([
  "MANIFEST_FROZEN",
  "MANIFEST_REVISED",
  "ROUND_OPENED",
  "ROUND_CLOSED",
  "ELIGIBILITY_FROZEN",
  "SOURCE_OBSERVED",
  "EVIDENCE_STATE_RECORDED",
  "LANE_PACKET_COMPILED",
  "LANE_RESULT_DECLASSIFIED",
]);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function stableCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const REGISTRY = Object.freeze({
  MANIFEST_FROZEN: Object.freeze({
    authority_class: "BUYER_CONTROL",
    payload_keys: ["manifest_digest", "manifest_revision", "manifest_identity", "supplier_ids"],
    artifact_types: ["R3_FROZEN_MANIFEST"],
  }),
  MANIFEST_REVISED: Object.freeze({
    authority_class: "BUYER_CONTROL",
    payload_keys: ["manifest_digest", "manifest_revision", "manifest_identity", "predecessor_manifest_digest", "changed_fields", "supplier_ids"],
    artifact_types: ["R3_FROZEN_MANIFEST"],
  }),
  ROUND_OPENED: Object.freeze({
    authority_class: "BUYER_CONTROL",
    payload_keys: ["round_id", "round_type", "manifest_revision", "manifest_digest", "status", "predecessor_round_id", "supplier_ids"],
    artifact_types: ["R3_ROUND_STATE"],
  }),
  ROUND_CLOSED: Object.freeze({
    authority_class: "SYSTEM_DERIVED",
    payload_keys: ["round_id", "round_type", "manifest_revision", "manifest_digest", "status", "state_digest", "supplier_ids"],
    artifact_types: ["R3_ROUND_STATE"],
  }),
  ELIGIBILITY_FROZEN: Object.freeze({
    authority_class: "SYSTEM_DERIVED",
    payload_keys: ["round_id", "state_digest", "eligibility_digest", "eligible_supplier_ids"],
    artifact_types: ["R3_ROUND_STATE"],
  }),
  SOURCE_OBSERVED: Object.freeze({
    authority_class: "SUPPLIER_EVIDENCE",
    payload_keys: ["round_id", "supplier_id", "source_snapshot_digest", "mailbox_id", "email_id", "content_state"],
    artifact_types: ["R4_SOURCE_SNAPSHOT"],
  }),
  EVIDENCE_STATE_RECORDED: Object.freeze({
    authority_class: "SYSTEM_DERIVED",
    payload_keys: ["round_id", "supplier_id", "evidence_id", "source_snapshot_digest", "field_name", "verification_state"],
    artifact_types: ["R4_EVIDENCE_RECORD", "R4R_EVIDENCE_RECORD"],
  }),
  LANE_PACKET_COMPILED: Object.freeze({
    authority_class: "SYSTEM_DERIVED",
    payload_keys: ["round_id", "supplier_id", "lane_id", "packet_digest", "evidence_id"],
    artifact_types: ["R5_LANE_PACKET"],
  }),
  LANE_RESULT_DECLASSIFIED: Object.freeze({
    authority_class: "SYSTEM_DERIVED",
    payload_keys: ["round_id", "supplier_id", "lane_id", "packet_digest", "declassification_digest"],
    artifact_types: ["R5_DECLASSIFIED_RESULT"],
  }),
});

export const EVENT_ENVELOPE_KEYS = Object.freeze([
  "event_schema_version",
  "sourcing_id",
  "sequence",
  "event_id",
  "command_id",
  "event_type",
  "authority_class",
  "payload",
  "payload_digest",
  "artifact_refs",
  "previous_event_digest",
  "event_digest",
  "recorded_at",
  "producer",
]);

export const COMMAND_KEYS = Object.freeze([
  "command_schema_version",
  "sourcing_id",
  "command_id",
  "event_type",
  "payload",
  "artifact_refs",
  "expected_head_event_digest",
]);

function exactKeys(value, allowed, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`);
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s)`, { path, unknown });
}

function requiredKeys(value, required, path) {
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) fail("MISSING_FIELD", `${path} is missing required field(s)`, { path, missing });
}

function string(value, path, { pattern = null, max = 4096 } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) fail("INVALID_STRING", `${path} must be a bounded string`);
  if (pattern && !pattern.test(value)) fail("INVALID_STRING", `${path} has an invalid format`);
  return value;
}

function digest(value, path) {
  return string(value, path, { max: 64, pattern: DIGEST_RE });
}

function positiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) fail("INVALID_INTEGER", `${path} must be a positive safe integer`);
  return value;
}

function nullableDigest(value, path) {
  if (value === null) return null;
  return digest(value, path);
}

function normalizeRefs(refs, path = "artifact_refs") {
  if (!Array.isArray(refs)) fail("INVALID_ARTIFACT_REFS", `${path} must be an array`);
  const normalized = refs.map((ref, index) => {
    validateArtifactReference(ref, `${path}[${index}]`);
    return { digest: ref.digest, artifact_type: ref.artifact_type };
  }).sort((a, b) => stableCompare(`${a.artifact_type}:${a.digest}`, `${b.artifact_type}:${b.digest}`));
  const seen = new Set();
  for (const ref of normalized) {
    const key = `${ref.artifact_type}:${ref.digest}`;
    if (seen.has(key)) fail("DUPLICATE_ARTIFACT_REF", `${path} contains a duplicate reference`);
    seen.add(key);
  }
  return normalized;
}

function validateSupplierIds(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail("INVALID_SUPPLIER_IDS", `${path} must be a non-empty array`);
  const ids = value.map((item, index) => string(item, `${path}[${index}]`, { pattern: ID_RE, max: 256 }));
  if (new Set(ids).size !== ids.length) fail("DUPLICATE_SUPPLIER_ID", `${path} contains duplicate supplier IDs`);
  const sorted = [...ids].sort(stableCompare);
  if (canonicalize(ids) !== canonicalize(sorted)) fail("NON_CANONICAL_ARRAY", `${path} must be sorted by supplier ID`);
  return ids;
}

function validatePayload(eventType, payload) {
  const rule = REGISTRY[eventType];
  exactKeys(payload, rule.payload_keys, `payload.${eventType}`);
  requiredKeys(payload, rule.payload_keys, `payload.${eventType}`);
  switch (eventType) {
    case "MANIFEST_FROZEN":
      digest(payload.manifest_digest, "payload.manifest_digest");
      positiveInteger(payload.manifest_revision, "payload.manifest_revision");
      string(payload.manifest_identity, "payload.manifest_identity", { pattern: ID_RE });
      validateSupplierIds(payload.supplier_ids, "payload.supplier_ids");
      break;
    case "MANIFEST_REVISED":
      digest(payload.manifest_digest, "payload.manifest_digest");
      positiveInteger(payload.manifest_revision, "payload.manifest_revision");
      string(payload.manifest_identity, "payload.manifest_identity", { pattern: ID_RE });
      digest(payload.predecessor_manifest_digest, "payload.predecessor_manifest_digest");
      if (!Array.isArray(payload.changed_fields) || payload.changed_fields.length === 0) fail("INVALID_CHANGED_FIELDS", "manifest revision must declare changed fields");
      for (const [index, field] of payload.changed_fields.entries()) string(field, `payload.changed_fields[${index}]`, { max: 512 });
      if (new Set(payload.changed_fields).size !== payload.changed_fields.length) fail("DUPLICATE_CHANGED_FIELD", "changed_fields contains duplicates");
      if (canonicalize(payload.changed_fields) !== canonicalize([...payload.changed_fields].sort(stableCompare))) fail("NON_CANONICAL_ARRAY", "changed_fields must be sorted");
      validateSupplierIds(payload.supplier_ids, "payload.supplier_ids");
      break;
    case "ROUND_OPENED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      if (!["INITIAL", "FINAL_REVISION"].includes(payload.round_type)) fail("INVALID_ROUND_TYPE", "round_type is not an R3 round type");
      positiveInteger(payload.manifest_revision, "payload.manifest_revision");
      digest(payload.manifest_digest, "payload.manifest_digest");
      if (!["OPEN", "FINAL_REVISION_OPEN"].includes(payload.status)) fail("INVALID_OPEN_STATUS", "opened round has an invalid status");
      if (payload.predecessor_round_id !== null) string(payload.predecessor_round_id, "payload.predecessor_round_id", { pattern: ID_RE });
      validateSupplierIds(payload.supplier_ids, "payload.supplier_ids");
      break;
    case "ROUND_CLOSED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      if (!["INITIAL", "FINAL_REVISION"].includes(payload.round_type)) fail("INVALID_ROUND_TYPE", "round_type is not an R3 round type");
      positiveInteger(payload.manifest_revision, "payload.manifest_revision");
      digest(payload.manifest_digest, "payload.manifest_digest");
      if (!["CLOSED", "FINAL_REVISION_CLOSED"].includes(payload.status)) fail("INVALID_CLOSED_STATUS", "closed round has an invalid status");
      digest(payload.state_digest, "payload.state_digest");
      validateSupplierIds(payload.supplier_ids, "payload.supplier_ids");
      break;
    case "ELIGIBILITY_FROZEN":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      digest(payload.state_digest, "payload.state_digest");
      digest(payload.eligibility_digest, "payload.eligibility_digest");
      validateSupplierIds(payload.eligible_supplier_ids, "payload.eligible_supplier_ids");
      break;
    case "SOURCE_OBSERVED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      string(payload.supplier_id, "payload.supplier_id", { pattern: ID_RE });
      digest(payload.source_snapshot_digest, "payload.source_snapshot_digest");
      string(payload.mailbox_id, "payload.mailbox_id", { max: 512 });
      string(payload.email_id, "payload.email_id", { max: 512 });
      if (!["CONTENT_AVAILABLE_FOR_EVIDENCE", "CONTENT_METADATA_ONLY", "CONTENT_BLOCKED"].includes(payload.content_state)) fail("INVALID_CONTENT_STATE", "source content state is not an R4 state");
      break;
    case "EVIDENCE_STATE_RECORDED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      string(payload.supplier_id, "payload.supplier_id", { pattern: ID_RE });
      string(payload.evidence_id, "payload.evidence_id", { max: 512 });
      digest(payload.source_snapshot_digest, "payload.source_snapshot_digest");
      string(payload.field_name, "payload.field_name", { pattern: ID_RE, max: 256 });
      if (!["VERIFIED", "UNKNOWN", "CONFLICT", "BLOCKED", "NOT_APPLICABLE", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "SOURCE_BLOCKED", "AMBIGUOUS", "LATE"].includes(payload.verification_state)) fail("INVALID_EVIDENCE_STATE", "evidence state is not supported");
      break;
    case "LANE_PACKET_COMPILED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      string(payload.supplier_id, "payload.supplier_id", { pattern: ID_RE });
      string(payload.lane_id, "payload.lane_id", { pattern: ID_RE });
      digest(payload.packet_digest, "payload.packet_digest");
      string(payload.evidence_id, "payload.evidence_id", { max: 512 });
      break;
    case "LANE_RESULT_DECLASSIFIED":
      string(payload.round_id, "payload.round_id", { pattern: ID_RE });
      string(payload.supplier_id, "payload.supplier_id", { pattern: ID_RE });
      string(payload.lane_id, "payload.lane_id", { pattern: ID_RE });
      digest(payload.packet_digest, "payload.packet_digest");
      digest(payload.declassification_digest, "payload.declassification_digest");
      break;
    default:
      fail("UNKNOWN_EVENT_TYPE", `unknown event type ${eventType}`);
  }
  return true;
}

function registryFor(eventType) {
  const rule = REGISTRY[eventType];
  if (!rule) fail("UNKNOWN_EVENT_TYPE", `unknown event type ${eventType}`);
  return rule;
}

export function eventRule(eventType) {
  const rule = registryFor(eventType);
  return Object.freeze({ ...rule, payload_keys: [...rule.payload_keys], artifact_types: [...rule.artifact_types] });
}

export function validateCommand(raw) {
  exactKeys(raw, COMMAND_KEYS, "command");
  requiredKeys(raw, ["command_schema_version", "sourcing_id", "command_id", "event_type", "payload", "artifact_refs"], "command");
  if (raw.command_schema_version !== R6_VERSIONS.command) fail("COMMAND_VERSION", "unsupported command schema");
  string(raw.sourcing_id, "command.sourcing_id", { pattern: ID_RE });
  string(raw.command_id, "command.command_id", { pattern: ID_RE });
  string(raw.event_type, "command.event_type", { pattern: ID_RE });
  const rule = registryFor(raw.event_type);
  validatePayload(raw.event_type, raw.payload);
  const refs = normalizeRefs(raw.artifact_refs);
  if (refs.length !== 1 || refs.some((ref) => !rule.artifact_types.includes(ref.artifact_type))) {
    fail("ARTIFACT_SET_MISMATCH", `command for ${raw.event_type} has the wrong artifact type set`, { expected: rule.artifact_types, actual: refs.map((ref) => ref.artifact_type) });
  }
  if (raw.expected_head_event_digest !== undefined && raw.expected_head_event_digest !== null) digest(raw.expected_head_event_digest, "command.expected_head_event_digest");
  return Object.freeze({
    command_schema_version: raw.command_schema_version,
    sourcing_id: raw.sourcing_id,
    command_id: raw.command_id,
    event_type: raw.event_type,
    payload: cloneJson(raw.payload),
    artifact_refs: refs.map((ref) => artifactRef(ref.digest, ref.artifact_type)),
    expected_head_event_digest: raw.expected_head_event_digest ?? null,
  });
}

export function commandSemanticDigest(command) {
  const normalized = validateCommand(command);
  return sha256Canonical({
    sourcing_id: normalized.sourcing_id,
    command_id: normalized.command_id,
    event_type: normalized.event_type,
    payload: normalized.payload,
    artifact_refs: normalized.artifact_refs,
  });
}

export function genesisDigest(sourcingId) {
  string(sourcingId, "sourcing_id", { pattern: ID_RE });
  return sha256Canonical({ genesis_schema_version: "r6.genesis.v1", sourcing_id: sourcingId, marker: "R6_EMPTY_JOURNAL" });
}

export function eventIdFor({ sourcing_id, command_id, event_type, authority_class, payload_digest, artifact_refs, previous_event_digest }) {
  return `r6-event-${sha256Canonical({ sourcing_id, command_id, event_type, authority_class, payload_digest, artifact_refs, previous_event_digest })}`;
}

export function eventDigestFor(event) {
  const withoutDigest = { ...event };
  delete withoutDigest.event_digest;
  return sha256Canonical(withoutDigest);
}

export function buildEvent(command, { sequence, previous_event_digest, recorded_at, producer = { name: "r6-journal", version: R6_VERSIONS.producer } }) {
  const normalized = validateCommand(command);
  positiveInteger(sequence, "sequence");
  digest(previous_event_digest, "previous_event_digest");
  string(recorded_at, "recorded_at", { pattern: UTC_RE, max: 24 });
  exactKeys(producer, ["name", "version"], "producer");
  requiredKeys(producer, ["name", "version"], "producer");
  string(producer.name, "producer.name", { max: 128 });
  string(producer.version, "producer.version", { max: 128 });
  const rule = registryFor(normalized.event_type);
  const authority_class = rule.authority_class;
  const payload_digest = sha256Canonical(normalized.payload);
  const event = {
    event_schema_version: R6_VERSIONS.event,
    sourcing_id: normalized.sourcing_id,
    sequence,
    event_id: eventIdFor({
      sourcing_id: normalized.sourcing_id,
      command_id: normalized.command_id,
      event_type: normalized.event_type,
      authority_class,
      payload_digest,
      artifact_refs: normalized.artifact_refs,
      previous_event_digest,
    }),
    command_id: normalized.command_id,
    event_type: normalized.event_type,
    authority_class,
    payload: cloneJson(normalized.payload),
    payload_digest,
    artifact_refs: normalized.artifact_refs.map((ref) => ({ ...ref })),
    previous_event_digest,
    event_digest: null,
    recorded_at,
    producer: { name: producer.name, version: producer.version },
  };
  event.event_digest = eventDigestFor(event);
  return Object.freeze(event);
}

export function validateEventEnvelope(event, { expected_sourcing_id = null } = {}) {
  exactKeys(event, EVENT_ENVELOPE_KEYS, "event");
  requiredKeys(event, EVENT_ENVELOPE_KEYS, "event");
  if (event.event_schema_version !== R6_VERSIONS.event) fail("EVENT_VERSION", "unsupported event schema");
  string(event.sourcing_id, "event.sourcing_id", { pattern: ID_RE });
  if (expected_sourcing_id !== null && event.sourcing_id !== expected_sourcing_id) fail("SOURCING_ID_MISMATCH", "event belongs to another sourcing aggregate");
  positiveInteger(event.sequence, "event.sequence");
  string(event.event_id, "event.event_id", { max: 512 });
  string(event.command_id, "event.command_id", { pattern: ID_RE });
  string(event.event_type, "event.event_type", { pattern: ID_RE });
  const rule = registryFor(event.event_type);
  if (event.authority_class !== rule.authority_class) fail("AUTHORITY_CLASS_MISMATCH", "event authority is not the registry authority");
  validatePayload(event.event_type, event.payload);
  const refs = normalizeRefs(event.artifact_refs);
  if (canonicalize(refs) !== canonicalize(event.artifact_refs)) fail("NON_CANONICAL_ARTIFACT_REFS", "event artifact references are not canonical");
  if (refs.length !== 1 || refs.some((ref) => !rule.artifact_types.includes(ref.artifact_type))) fail("ARTIFACT_SET_MISMATCH", "event artifact references do not match the event registry");
  if (sha256Canonical(event.payload) !== event.payload_digest) fail("PAYLOAD_DIGEST_MISMATCH", "event payload digest mismatch");
  digest(event.payload_digest, "event.payload_digest");
  digest(event.previous_event_digest, "event.previous_event_digest");
  string(event.recorded_at, "event.recorded_at", { pattern: UTC_RE, max: 24 });
  exactKeys(event.producer, ["name", "version"], "event.producer");
  requiredKeys(event.producer, ["name", "version"], "event.producer");
  string(event.producer.name, "event.producer.name", { max: 128 });
  string(event.producer.version, "event.producer.version", { max: 128 });
  if (event.producer.name !== "r6-journal" || event.producer.version !== R6_VERSIONS.producer) fail("PRODUCER_MISMATCH", "event producer is not the registered R6 journal producer");
  const expectedEventId = eventIdFor({
    sourcing_id: event.sourcing_id,
    command_id: event.command_id,
    event_type: event.event_type,
    authority_class: event.authority_class,
    payload_digest: event.payload_digest,
    artifact_refs: refs,
    previous_event_digest: event.previous_event_digest,
  });
  if (event.event_id !== expectedEventId) fail("EVENT_ID_MISMATCH", "event ID is not the deterministic command identity");
  if (event.event_digest !== eventDigestFor(event)) fail("EVENT_DIGEST_MISMATCH", "event digest does not match canonical envelope");
  return true;
}

export function expectedArtifactTypes(eventType) {
  return [...registryFor(eventType).artifact_types];
}

export function isR6Error(error) {
  return error instanceof R6Error;
}
