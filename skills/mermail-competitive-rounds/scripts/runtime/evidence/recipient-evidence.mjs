import {
  CONTENT_STATES,
  MESSAGE_CLASSES,
  R4ValidationError,
  createClaimProposal,
  createTimeEvidence,
  normalizeTypedFieldValue,
  sha256Canonical,
  validateSourceSnapshot,
  verifyExactSpan,
} from "./adapter-evidence.mjs";

export const R4R_VERSIONS = Object.freeze({
  observation: "r4r.observation.v1",
  attribution: "r4r.supplier-attribution.v1",
  evidence: "r4r.recipient-evidence.v1",
  lanePacket: "r4r.recipient-lane-packet.v1",
});

export const OBSERVATION_ROLES = Object.freeze({
  BUYER_RECEIVED: "BUYER_RECEIVED",
  SUPPLIER_SENT_CORROBORATION: "SUPPLIER_SENT_CORROBORATION",
});

export const ATTRIBUTION_STATES = Object.freeze({
  MATCH: "DECLARED_SUPPLIER_ADDRESS_MATCH",
  MISMATCH: "DECLARED_SUPPLIER_ADDRESS_MISMATCH",
  AMBIGUOUS: "AMBIGUOUS",
  UNKNOWN: "UNKNOWN",
});

export const AUTHENTICATION_STATES = Object.freeze({
  PASS: "PASS",
  UNKNOWN: "UNKNOWN",
  FAIL: "FAIL",
});

export const RECIPIENT_VERIFICATION_STATES = Object.freeze({
  VERIFIED: "VERIFIED",
  UNSUPPORTED: "UNSUPPORTED",
  AMBIGUOUS: "AMBIGUOUS",
  CONFLICT: "CONFLICT",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
  SOURCE_BLOCKED: "SOURCE_BLOCKED",
  UNKNOWN: "UNKNOWN",
  LATE: "LATE",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

const RECIPIENT_EVIDENCE_KEYS = Object.freeze([
  "evidence_schema_version",
  "evidence_id",
  "observation_role",
  "receipt_observation_id",
  "receipt_snapshot_digest",
  "source_snapshot_id",
  "buyer_mailbox_id",
  "buyer_email_id",
  "buyer_thread_id",
  "provider_message_id",
  "sourcing_id",
  "round_id",
  "manifest_revision",
  "manifest_digest",
  "supplier_id",
  "declared_supplier_contact",
  "observed_sender",
  "supplier_attribution_state",
  "sender_authentication_state",
  "source_span",
  "raw_source_fragment",
  "field_name",
  "normalized_value",
  "unit",
  "currency",
  "time_evidence",
  "verification_state",
  "reason",
  "record_digest",
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function fail(code, message, details = {}) {
  throw new R4ValidationError(code, message, details);
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail("INVALID_OBJECT", `${path} must be a plain object`, { path });
  return value;
}

function requireString(value, path, { max = 4096 } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    fail("INVALID_STRING", `${path} must be a non-empty string of length <= ${max}`, { path });
  }
  return value;
}

function optionalString(value, path, { max = 4096 } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > max) fail("INVALID_STRING", `${path} must be null or a string`, { path });
  return value;
}

function exactKeys(value, allowed, path) {
  requireObject(value, path);
  const allow = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allow.has(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${path} contains unknown field(s): ${unknown.join(", ")}`, { path, unknown });
}

function requiredKeys(value, required, path) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail("MISSING_FIELD", `${path}.${key} is required`, { path: `${path}.${key}` });
  }
}

function normalizeBareAddress(value, path) {
  if (typeof value !== "string") fail("INVALID_ADDRESS", `${path} must be a bare email address`, { path });
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.includes("<") || normalized.includes(">")) {
    fail("INVALID_ADDRESS", `${path} must be a bare email address`, { path });
  }
  return normalized;
}

function comparisonAddress(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EMAIL_RE.test(normalized) && !normalized.includes("<") && !normalized.includes(">") ? normalized : null;
}

function normalizeUtc(value, path) {
  if (value === null || value === undefined) return null;
  requireString(value, path, { max: 64 });
  if (!UTC_RE.test(value) || Number.isNaN(new Date(value).valueOf())) fail("INVALID_TIMESTAMP", `${path} must be a UTC timestamp`, { path });
  return new Date(value).toISOString();
}

function snapshotFailure(snapshot, code = "SNAPSHOT_INVALID") {
  try {
    validateSourceSnapshot(snapshot);
    return null;
  } catch (error) {
    return error instanceof R4ValidationError ? error.code : code;
  }
}

function observationDigest(role, snapshotDigest) {
  return sha256Canonical({
    observation_schema_version: R4R_VERSIONS.observation,
    observation_role: role,
    source_snapshot_digest: snapshotDigest,
  });
}

export function createRecipientObservation({ source_snapshot, observation_role }) {
  requireObject(source_snapshot, "source_snapshot");
  if (!Object.values(OBSERVATION_ROLES).includes(observation_role)) fail("OBSERVATION_ROLE", "unsupported observation role");
  validateSourceSnapshot(source_snapshot);
  if (observation_role === OBSERVATION_ROLES.BUYER_RECEIVED) {
    if (source_snapshot.message_class !== "INBOUND" || source_snapshot.folder_id !== "inbox") {
      fail("RECEIPT_NOT_INBOUND", "BUYER_RECEIVED must be an inbound inbox observation");
    }
  }
  if (observation_role === OBSERVATION_ROLES.SUPPLIER_SENT_CORROBORATION && source_snapshot.message_class === MESSAGE_CLASSES.DRAFT) {
    fail("CORROBORATION_DRAFT", "a draft cannot be a transport corroboration");
  }
  const result = {
    observation_schema_version: R4R_VERSIONS.observation,
    observation_role,
    source_snapshot: clone(source_snapshot),
    observation_digest: observationDigest(observation_role, source_snapshot.source_snapshot_digest),
  };
  return freeze(result);
}

export function validateRecipientObservation(observation) {
  exactKeys(observation, ["observation_schema_version", "observation_role", "source_snapshot", "observation_digest"], "observation");
  requiredKeys(observation, ["observation_schema_version", "observation_role", "source_snapshot", "observation_digest"], "observation");
  if (observation.observation_schema_version !== R4R_VERSIONS.observation) fail("OBSERVATION_VERSION", "unsupported recipient observation version");
  if (!Object.values(OBSERVATION_ROLES).includes(observation.observation_role)) fail("OBSERVATION_ROLE", "unsupported observation role");
  validateSourceSnapshot(observation.source_snapshot);
  const expected = observationDigest(observation.observation_role, observation.source_snapshot.source_snapshot_digest);
  if (expected !== observation.observation_digest) fail("OBSERVATION_DIGEST_MISMATCH", "observation digest mismatch");
  return true;
}

export function createSupplierAttributionContext({ frozen_manifest, supplier_id }) {
  requireObject(frozen_manifest, "frozen_manifest");
  if (frozen_manifest.type !== "FROZEN_MANIFEST") fail("MANIFEST_NOT_FROZEN", "supplier attribution requires a frozen R3 manifest");
  requireObject(frozen_manifest.manifest, "frozen_manifest.manifest");
  requireString(frozen_manifest.manifest_digest, "frozen_manifest.manifest_digest", { max: 128 });
  if (!Number.isInteger(frozen_manifest.manifest.manifest_revision) || frozen_manifest.manifest.manifest_revision < 1) fail("MANIFEST_REVISION", "manifest revision must be positive");
  const roster = frozen_manifest.manifest.supplier_roster;
  if (!Array.isArray(roster)) fail("SUPPLIER_ROSTER", "frozen manifest supplier roster must be an array");
  const supplier = roster.find((entry) => entry?.supplier_id === supplier_id);
  if (!supplier) fail("SUPPLIER_NOT_DECLARED", `supplier ${supplier_id} is absent from frozen manifest`);
  const declaredContacts = [];
  if (typeof supplier.address === "string") declaredContacts.push(supplier.address);
  if (Array.isArray(supplier.contacts)) declaredContacts.push(...supplier.contacts);
  if (declaredContacts.length === 0) fail("SUPPLIER_CONTACT_MISSING", "frozen supplier has no declared contact");
  const normalizedContacts = declaredContacts.map((entry, index) => normalizeBareAddress(entry, `supplier_roster.${supplier_id}.contacts[${index}]`));
  const result = {
    attribution_schema_version: R4R_VERSIONS.attribution,
    sourcing_id: frozen_manifest.manifest.sourcing_id,
    manifest_revision: frozen_manifest.manifest.manifest_revision,
    manifest_digest: frozen_manifest.manifest_digest,
    supplier_id,
    declared_contacts: [...new Set(normalizedContacts)].sort(),
    identity_ref: optionalString(supplier.identity_ref, "supplier.identity_ref", { max: 500 }),
  };
  result.context_digest = sha256Canonical(result);
  return freeze(result);
}

export function attributeReceiptToSupplier(observation, supplier_context) {
  validateRecipientObservation(observation);
  requireObject(supplier_context, "supplier_context");
  exactKeys(supplier_context, ["attribution_schema_version", "sourcing_id", "manifest_revision", "manifest_digest", "supplier_id", "declared_contacts", "identity_ref", "context_digest"], "supplier_context");
  requiredKeys(supplier_context, ["attribution_schema_version", "sourcing_id", "manifest_revision", "manifest_digest", "supplier_id", "declared_contacts", "context_digest"], "supplier_context");
  if (supplier_context.attribution_schema_version !== R4R_VERSIONS.attribution) fail("ATTRIBUTION_VERSION", "unsupported supplier attribution version");
  // The context digest is over the context before its digest field is added.
  const withoutDigest = { ...supplier_context };
  delete withoutDigest.context_digest;
  if (sha256Canonical(withoutDigest) !== supplier_context.context_digest) fail("ATTRIBUTION_DIGEST_MISMATCH", "supplier attribution context digest mismatch");
  const snapshot = observation.source_snapshot;
  const observed = comparisonAddress(snapshot.sender);
  const declared = Array.isArray(supplier_context.declared_contacts) ? supplier_context.declared_contacts.map((entry) => comparisonAddress(entry)) : [];
  let state = ATTRIBUTION_STATES.UNKNOWN;
  let reason = "sender_address_unavailable";
  if (snapshot.sender === null || snapshot.sender === undefined || snapshot.sender === "") {
    state = ATTRIBUTION_STATES.UNKNOWN;
  } else if (!observed || declared.some((entry) => entry === null)) {
    state = ATTRIBUTION_STATES.AMBIGUOUS;
    reason = "sender_or_declared_contact_not_a_bare_address";
  } else if (declared.includes(observed)) {
    state = ATTRIBUTION_STATES.MATCH;
    reason = "observed_sender_matches_manifest_declared_contact";
  } else {
    state = ATTRIBUTION_STATES.MISMATCH;
    reason = "observed_sender_does_not_match_manifest_declared_contact";
  }
  const result = {
    attribution_schema_version: R4R_VERSIONS.attribution,
    supplier_id: supplier_context.supplier_id,
    manifest_revision: supplier_context.manifest_revision,
    manifest_digest: supplier_context.manifest_digest,
    observed_sender: snapshot.sender,
    declared_contacts: clone(supplier_context.declared_contacts),
    state,
    comparison_rule: "trim_outer_whitespace_and_ascii_lowercase_bare_address_only",
    reason,
    attribution_digest: null,
  };
  result.attribution_digest = sha256Canonical({ ...result, attribution_digest: null });
  return freeze(result);
}

export function senderAuthenticationState(snapshot) {
  validateSourceSnapshot(snapshot);
  const raw = snapshot.sender_authentication;
  const status = typeof raw?.status === "string" ? raw.status.toLowerCase() : "unknown";
  const state = status === "pass" ? AUTHENTICATION_STATES.PASS : status === "unknown" ? AUTHENTICATION_STATES.UNKNOWN : AUTHENTICATION_STATES.FAIL;
  return freeze({
    state,
    raw_status: raw?.status ?? null,
    reason: raw?.reason ?? null,
    policy_meaning: state === AUTHENTICATION_STATES.PASS ? "provider_reported_pass" : state === AUTHENTICATION_STATES.UNKNOWN ? "provider_verdict_unknown" : "provider_reported_non_pass",
  });
}

function lateStatus(snapshot, options) {
  if (!options.cutoff_at) return "NOT_EVALUATED";
  const sourceTimestamp = createTimeEvidence(snapshot).source_timestamp;
  if (!sourceTimestamp) return "UNKNOWN";
  const cutoff = normalizeUtc(options.cutoff_at, "cutoff_at");
  const sourceMs = Date.parse(sourceTimestamp);
  const cutoffMs = Date.parse(cutoff);
  return sourceMs < cutoffMs || (sourceMs === cutoffMs && options.cutoff_inclusive === true) ? "ON_TIME" : "LATE";
}

function emptyEvidenceFields({ observation = null, supplier_context = null, proposal = null, attribution = null, auth = null } = {}) {
  const snapshot = observation?.source_snapshot ?? null;
  let timeEvidence = null;
  if (snapshot) {
    try {
      timeEvidence = createTimeEvidence(snapshot);
    } catch {
      timeEvidence = null;
    }
  }
  return {
    evidence_schema_version: R4R_VERSIONS.evidence,
    evidence_id: null,
    observation_role: observation?.observation_role ?? OBSERVATION_ROLES.BUYER_RECEIVED,
    receipt_observation_id: observation?.observation_digest ?? null,
    receipt_snapshot_digest: snapshot?.source_snapshot_digest ?? proposal?.source_snapshot_digest ?? null,
    source_snapshot_id: snapshot?.source_snapshot_id ?? null,
    buyer_mailbox_id: snapshot?.mailbox_id ?? proposal?.mailbox_id ?? null,
    buyer_email_id: snapshot?.email_id ?? proposal?.email_id ?? null,
    buyer_thread_id: snapshot?.thread_id ?? null,
    provider_message_id: snapshot?.provider_message_id ?? proposal?.provider_message_id ?? null,
    sourcing_id: proposal?.sourcing_id ?? supplier_context?.sourcing_id ?? null,
    round_id: proposal?.round_id ?? null,
    manifest_revision: supplier_context?.manifest_revision ?? null,
    manifest_digest: supplier_context?.manifest_digest ?? null,
    supplier_id: proposal?.supplier_id ?? supplier_context?.supplier_id ?? null,
    declared_supplier_contact: supplier_context?.declared_contacts?.[0] ?? null,
    observed_sender: snapshot?.sender ?? null,
    supplier_attribution_state: attribution?.state ?? ATTRIBUTION_STATES.UNKNOWN,
    sender_authentication_state: auth?.state ?? AUTHENTICATION_STATES.UNKNOWN,
    source_span: proposal?.source_span ? clone(proposal.source_span) : null,
    raw_source_fragment: proposal?.raw_source_fragment ?? null,
    field_name: proposal?.field_name ?? null,
    normalized_value: null,
    unit: null,
    currency: null,
    time_evidence: timeEvidence,
    verification_state: RECIPIENT_VERIFICATION_STATES.UNKNOWN,
    reason: "not_verified",
    record_digest: null,
  };
}

function finalizeEvidence(base) {
  base.evidence_id = `r4r-evidence-${sha256Canonical({ ...base, evidence_id: null, record_digest: null })}`;
  base.record_digest = sha256Canonical({ ...base, record_digest: null });
  exactKeys(base, RECIPIENT_EVIDENCE_KEYS, "recipient_evidence");
  return freeze(base);
}

function failureEvidence(context, verification_state, reason) {
  const base = emptyEvidenceFields(context);
  base.verification_state = verification_state;
  base.reason = reason;
  return finalizeEvidence(base);
}

function validateContextBinding(observation, supplier_context, proposal) {
  const snapshot = observation.source_snapshot;
  if (proposal.source_snapshot_digest !== snapshot.source_snapshot_digest) return "source_snapshot_digest_mismatch";
  if (proposal.mailbox_id !== snapshot.mailbox_id || proposal.email_id !== snapshot.email_id) return "mailbox_or_email_identity_mismatch";
  if (proposal.provider_message_id !== null && proposal.provider_message_id !== snapshot.provider_message_id) return "provider_identity_mismatch";
  if (proposal.supplier_id !== supplier_context.supplier_id) return "supplier_attribution_context_mismatch";
  if (proposal.sourcing_id !== supplier_context.sourcing_id) return "sourcing_context_mismatch";
  return null;
}

export function verifyRecipientClaim({ observation, supplier_context, raw_proposal, buyer_mailbox_id, require_authenticated_sender = false, cutoff_at = null, cutoff_inclusive = false }) {
  let proposal;
  try {
    proposal = createClaimProposal(raw_proposal);
  } catch (error) {
    return {
      verification_state: RECIPIENT_VERIFICATION_STATES.UNKNOWN,
      reason: error instanceof R4ValidationError ? error.code : "INVALID_PROPOSAL",
    };
  }
  const context = { observation, supplier_context, proposal };
  try {
    validateRecipientObservation(observation);
  } catch (error) {
    return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_UNAVAILABLE, error instanceof R4ValidationError ? error.code : "OBSERVATION_INVALID");
  }
  try {
    const snapshotError = snapshotFailure(observation.source_snapshot);
    if (snapshotError) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_UNAVAILABLE, snapshotError);
    if (observation.observation_role !== OBSERVATION_ROLES.BUYER_RECEIVED) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_BLOCKED, "canonical_commercial_evidence_requires_buyer_receipt");
    if (observation.source_snapshot.mailbox_id !== buyer_mailbox_id) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_UNAVAILABLE, "buyer_mailbox_identity_mismatch");
    if (observation.source_snapshot.message_class !== "INBOUND" || observation.source_snapshot.folder_id !== "inbox") return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_BLOCKED, "not_an_inbound_buyer_receipt");
    if (observation.source_snapshot.message_class === MESSAGE_CLASSES.DRAFT) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_BLOCKED, "draft_is_not_buyer_receipt");
    if (observation.source_snapshot.content_state !== "CONTENT_AVAILABLE_FOR_EVIDENCE") return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_BLOCKED, observation.source_snapshot.content_state);
    const attribution = attributeReceiptToSupplier(observation, supplier_context);
    const auth = senderAuthenticationState(observation.source_snapshot);
    context.attribution = attribution;
    context.auth = auth;
    if (attribution.state !== ATTRIBUTION_STATES.MATCH) return failureEvidence(context, attribution.state === ATTRIBUTION_STATES.MISMATCH ? RECIPIENT_VERIFICATION_STATES.UNSUPPORTED : RECIPIENT_VERIFICATION_STATES.AMBIGUOUS, `supplier_attribution_${attribution.state.toLowerCase()}`);
    const bindingError = validateContextBinding(observation, supplier_context, proposal);
    if (bindingError) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.SOURCE_UNAVAILABLE, bindingError);
    if (require_authenticated_sender === true && auth.state !== AUTHENTICATION_STATES.PASS) return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.UNKNOWN, "sender_authentication_not_pass");
    const spanResult = verifyExactSpan(observation.source_snapshot, proposal);
    if (spanResult.state !== "VERIFIED") return failureEvidence(context, spanResult.state, spanResult.reason);
    const timeStatus = lateStatus(observation.source_snapshot, { cutoff_at, cutoff_inclusive });
    if (timeStatus === "LATE") return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.LATE, "source_timestamp_after_round_cutoff");
    if (timeStatus === "UNKNOWN") return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.UNKNOWN, "source_timestamp_unavailable");
    const normalized = normalizeTypedFieldValue(proposal.field_name, spanResult.fragment, proposal.proposed_value, proposal.proposed_unit, proposal.proposed_currency);
    if (normalized.state !== "VERIFIED") return failureEvidence(context, normalized.state, normalized.reason);
    const base = emptyEvidenceFields(context);
    base.normalized_value = normalized.value;
    base.unit = normalized.unit ?? null;
    base.currency = normalized.currency ?? null;
    base.verification_state = RECIPIENT_VERIFICATION_STATES.VERIFIED;
    base.reason = "buyer_receipt_exact_source_span_and_typed_value_verified";
    return finalizeEvidence(base);
  } catch (error) {
    return failureEvidence(context, RECIPIENT_VERIFICATION_STATES.UNKNOWN, error instanceof R4ValidationError ? error.code : "VERIFICATION_ERROR");
  }
}

export function validateRecipientEvidence(record) {
  exactKeys(record, RECIPIENT_EVIDENCE_KEYS, "recipient_evidence");
  requiredKeys(record, RECIPIENT_EVIDENCE_KEYS, "recipient_evidence");
  if (record.evidence_schema_version !== R4R_VERSIONS.evidence) fail("EVIDENCE_VERSION", "unsupported recipient evidence version");
  const expectedRecordDigest = sha256Canonical({ ...record, record_digest: null });
  if (expectedRecordDigest !== record.record_digest) fail("EVIDENCE_DIGEST_MISMATCH", "recipient evidence digest mismatch");
  return true;
}

export function correlateRecipientEvidence(canonical_observation, corroborating_observation = null) {
  validateRecipientObservation(canonical_observation);
  if (canonical_observation.observation_role !== OBSERVATION_ROLES.BUYER_RECEIVED) fail("CANONICAL_ROLE", "canonical observation must be BUYER_RECEIVED");
  if (corroborating_observation === null) return freeze({ classification: "CORROBORATION_ABSENT_OPTIONAL", canonical_snapshot_digest: canonical_observation.source_snapshot.source_snapshot_digest, canonical_remains_authoritative: true });
  validateRecipientObservation(corroborating_observation);
  if (corroborating_observation.observation_role !== OBSERVATION_ROLES.SUPPLIER_SENT_CORROBORATION) fail("CORROBORATION_ROLE", "optional observation must be SUPPLIER_SENT_CORROBORATION");
  const first = canonical_observation.source_snapshot;
  const second = corroborating_observation.source_snapshot;
  const sameProvider = first.provider_message_id !== null && first.provider_message_id === second.provider_message_id;
  return freeze({
    classification: sameProvider ? "CORRELATED_TRANSPORT_OBSERVATIONS" : "CORROBORATION_CONFLICT_REVIEW",
    canonical_snapshot_digest: first.source_snapshot_digest,
    corroborating_snapshot_digest: second.source_snapshot_digest,
    provider_message_id_match: sameProvider,
    mailbox_local_id_distinct: first.mailbox_id !== second.mailbox_id && first.email_id !== second.email_id,
    canonical_remains_authoritative: true,
    provider_id_is_not_local_action_authority: true,
  });
}

function scanForbidden(value, path = "$") {
  if (value === null || value === undefined || typeof value !== "object") return [];
  const forbidden = new Set(["buyer_reserve", "batna", "oauth", "token", "mcp", "send_email", "reply_to_email", "approval_state", "other_suppliers", "competitor_evidence", "supplier_mailbox_id"]);
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) hits.push(`${path}.${key}`);
    hits.push(...scanForbidden(child, `${path}.${key}`));
  }
  return hits;
}

export function compileRecipientLanePacket({ evidence, supplier_context, common_field_schema }) {
  validateRecipientEvidence(evidence);
  if (evidence.verification_state !== RECIPIENT_VERIFICATION_STATES.VERIFIED) fail("EVIDENCE_NOT_VERIFIED", "lane packet requires verified recipient evidence");
  requireObject(supplier_context, "supplier_context");
  if (evidence.supplier_id !== supplier_context.supplier_id) fail("SUPPLIER_CONTEXT_MISMATCH", "evidence and supplier context differ");
  if (!Array.isArray(common_field_schema)) fail("FIELD_SCHEMA", "common_field_schema must be an array");
  const packet = {
    packet_schema_version: R4R_VERSIONS.lanePacket,
    packet_type: "ONE_SUPPLIER_LANE_FROM_BUYER_RECEIPT",
    sourcing_id: evidence.sourcing_id,
    round_id: evidence.round_id,
    manifest_revision: evidence.manifest_revision,
    manifest_digest: evidence.manifest_digest,
    supplier_id: evidence.supplier_id,
    supplier_identity: {
      supplier_id: supplier_context.supplier_id,
      declared_contacts: clone(supplier_context.declared_contacts),
      identity_ref: supplier_context.identity_ref,
      attribution_state: evidence.supplier_attribution_state,
    },
    common_field_schema: clone(common_field_schema),
    receipt_evidence: clone(evidence),
    trust_labels: {
      policy: "BUYER_CONTROL_FROM_R3",
      receipt_metadata: "MERMAIL_BUYER_MAILBOX_OBSERVATION",
      sender_attribution: "DECLARED_CONTACT_MATCH_NOT_AUTHENTICATION",
      sender_authentication: evidence.sender_authentication_state,
      message_content: "UNTRUSTED_CONTENT",
      field_claim: "VERIFIED_ONLY_BY_DETERMINISTIC_RECEIPT_BOUND_VERIFIER",
      packet_scope: "ONE_SUPPLIER_ONLY",
    },
    packet_digest: null,
  };
  const hits = scanForbidden(packet);
  if (hits.length) fail("FORBIDDEN_PACKET_FIELD", `packet contains forbidden field(s): ${hits.join(", ")}`, { hits });
  packet.packet_digest = sha256Canonical({ ...packet, packet_digest: null });
  return freeze(packet);
}

export function validateRecipientLanePacket(packet, { foreignSupplierIds = [], forbiddenStrings = [] } = {}) {
  requireObject(packet, "recipient_lane_packet");
  if (packet.packet_schema_version !== R4R_VERSIONS.lanePacket) fail("PACKET_VERSION", "unsupported recipient lane packet version");
  if (packet.packet_type !== "ONE_SUPPLIER_LANE_FROM_BUYER_RECEIPT") fail("PACKET_TYPE", "unexpected recipient lane packet type");
  validateRecipientEvidence(packet.receipt_evidence);
  const serialized = JSON.stringify(packet);
  for (const foreign of foreignSupplierIds) if (serialized.includes(foreign)) fail("FOREIGN_SUPPLIER_LEAK", `packet contains foreign supplier identifier ${foreign}`);
  for (const forbidden of forbiddenStrings) if (serialized.includes(forbidden)) fail("FOREIGN_CONTENT_LEAK", "packet contains forbidden content");
  const expected = sha256Canonical({ ...packet, packet_digest: null });
  if (expected !== packet.packet_digest) fail("PACKET_DIGEST_MISMATCH", "recipient lane packet digest mismatch");
  return true;
}

export function makeRecipientClaimProposal({ snapshot, field_name, fragment, proposed_value, proposed_unit = null, proposed_currency = null, supplier_id, sourcing_id = "source-001", round_id = "source-001-initial-1", producer_reference = "r4r-deterministic-extractor-1" }) {
  const start = snapshot.content.current_text.indexOf(fragment);
  if (start < 0) fail("FRAGMENT_NOT_FOUND", "proposal fragment is absent from snapshot content");
  return createClaimProposal({
    proposal_schema_version: "r4.claim-proposal.v1",
    sourcing_id,
    round_id,
    supplier_id,
    source_snapshot_digest: snapshot.source_snapshot_digest,
    mailbox_id: snapshot.mailbox_id,
    email_id: snapshot.email_id,
    provider_message_id: snapshot.provider_message_id,
    source_span: {
      representation: "TEXT",
      provenance_class: "CURRENT_MESSAGE",
      content_hash: snapshot.content_hash,
      start,
      end: start + fragment.length,
      occurrence: 0,
    },
    raw_source_fragment: fragment,
    field_name,
    proposed_value,
    proposed_unit,
    proposed_currency,
    producer: { kind: "DETERMINISTIC_EXTRACTOR", reference: producer_reference },
  });
}

export { RECIPIENT_EVIDENCE_KEYS };
