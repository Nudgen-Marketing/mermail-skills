import {
  APPROVAL_CANDIDATE_VERSION,
  APPROVAL_VERSION,
  EFFECT_TYPES,
  INTENT_VERSION,
  PREVIEW_VERSION,
  address,
  clone,
  digest,
  digestWithout,
  exactKeys,
  fail,
  freeze,
  id,
  nullableString,
  requiredKeys,
  sha256Canonical,
  string,
  utc,
} from "./core.mjs";

const ATTACHMENT_KEYS = ["name", "digest", "bytes"];
const INTENT_KEYS = [
  "effect_schema_version", "effect_id", "sourcing_id", "round_id",
  "current_state_digest", "evaluation_digest", "effect_type", "mailbox_id",
  "reply_source_mailbox_id", "reply_source_email_id", "reply_thread_id",
  "expected_reply_target", "to", "from", "subject", "text", "html",
  "attachments", "communication_ref", "purpose", "idempotency_key",
  "request_digest", "intent_digest",
];
const PREVIEW_KEYS = [
  "preview_schema_version", "effect_id", "effect_intent_digest", "effect_type",
  "purpose", "sourcing_id", "round_id", "mailbox_id", "reply_source_mailbox_id",
  "reply_source_email_id", "reply_thread_id", "expected_reply_target", "from",
  "to", "subject", "text", "html", "attachments", "communication_ref",
  "current_state_digest", "evaluation_digest", "request_digest", "preview_digest",
];
const APPROVAL_CANDIDATE_KEYS = [
  "approval_schema_version", "approval_candidate_id", "effect_id", "effect_intent_digest",
  "preview_digest", "request_digest", "state_digest", "evaluation_digest",
  "actor_ref", "expires_at", "single_use", "candidate_digest",
];
const APPROVAL_INPUT_KEYS = ["approval_candidate_id", "candidate_digest", "decision", "actor_ref"];
const APPROVAL_KEYS = [
  "approval_schema_version", "approval_record_id", "approval_candidate_id", "candidate_digest",
  "effect_id", "effect_intent_digest", "preview_digest", "request_digest", "state_digest",
  "evaluation_digest", "actor_ref", "approved_at", "trusted_host_actor", "trusted_session_ref",
  "approval_input_digest", "expires_at", "single_use", "approval_digest",
];
const PURPOSES = Object.freeze([
  "RECOMMENDATION_NOTIFICATION",
  "HUMAN_REVIEW_REQUEST",
  "NO_DEAL_NOTIFICATION",
  "CONTROLLED_INTEGRATION_PROBE",
]);

function validateAttachments(value, path = "attachments") {
  if (!Array.isArray(value) || value.length > 20) fail("INVALID_ATTACHMENTS", `${path} must be a bounded array`);
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    exactKeys(item, ATTACHMENT_KEYS, `${path}[${index}]`);
    requiredKeys(item, ATTACHMENT_KEYS, `${path}[${index}]`);
    string(item.name, `${path}[${index}].name`, { max: 255 });
    digest(item.digest, `${path}[${index}].digest`);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 50 * 1024 * 1024) fail("INVALID_ATTACHMENT_SIZE", `${path}[${index}].bytes is invalid`);
    if (seen.has(item.name)) fail("DUPLICATE_ATTACHMENT", `${path} contains duplicate names`);
    seen.add(item.name);
  }
  return value;
}

function validateShared(input, { requireDerived = false } = {}) {
  if (!input || typeof input !== "object") fail("INVALID_INTENT", "effect intent must be an object");
  id(input.sourcing_id, "sourcing_id");
  id(input.round_id, "round_id");
  digest(input.current_state_digest, "current_state_digest");
  if (input.evaluation_digest !== null) digest(input.evaluation_digest, "evaluation_digest");
  if (!EFFECT_TYPES.includes(input.effect_type)) fail("UNKNOWN_EFFECT_TYPE", "only SEND_EMAIL and REPLY_TO_EMAIL are supported");
  string(input.mailbox_id, "mailbox_id", { max: 512 });
  if (input.reply_source_mailbox_id !== null) string(input.reply_source_mailbox_id, "reply_source_mailbox_id", { max: 512 });
  if (input.reply_source_email_id !== null) string(input.reply_source_email_id, "reply_source_email_id", { max: 512 });
  if (input.reply_thread_id !== null) string(input.reply_thread_id, "reply_thread_id", { max: 512 });
  if (input.expected_reply_target !== null) address(input.expected_reply_target, "expected_reply_target");
  address(input.to, "to");
  address(input.from, "from");
  string(input.subject, "subject", { max: 998 });
  string(input.text, "text", { max: 10000 });
  nullableString(input.html, "html", { max: 50000 });
  validateAttachments(input.attachments);
  string(input.communication_ref, "communication_ref", { max: 64 });
  string(input.purpose, "purpose", { max: 128 });
  if (!PURPOSES.includes(input.purpose)) fail("INVALID_PURPOSE", "purpose is not in the closed R8 purpose set");
  string(input.idempotency_key, "idempotency_key", { max: 255 });
  digest(input.request_digest, "request_digest");
  digest(input.intent_digest, "intent_digest");
  if (input.effect_type === "REPLY_TO_EMAIL") {
    if (input.reply_source_mailbox_id !== input.mailbox_id) fail("REPLY_SOURCE_MAILBOX_MISMATCH", "reply source mailbox must equal sending mailbox");
    string(input.reply_source_email_id, "reply_source_email_id", { max: 512 });
    address(input.expected_reply_target, "expected_reply_target");
  } else if (input.reply_source_mailbox_id !== null || input.reply_source_email_id !== null || input.reply_thread_id !== null || input.expected_reply_target !== null) {
    fail("UNEXPECTED_REPLY_AUTHORITY", "SEND_EMAIL cannot carry reply source authority");
  }
  if (requireDerived && input.effect_schema_version !== INTENT_VERSION) fail("INTENT_VERSION", "unsupported intent version");
  return true;
}

function requestBody(intent) {
  const body = {
    to: intent.to,
    from: intent.from,
    subject: intent.subject,
    text: intent.text,
  };
  if (intent.html !== null) body.html = intent.html;
  if (intent.attachments.length > 0) body.attachments = clone(intent.attachments);
  return body;
}

export function canonicalMutation(intent) {
  validateShared(intent, { requireDerived: true });
  const mutation = {
    action: intent.effect_type === "SEND_EMAIL" ? "send_email" : "reply_to_email",
    mailboxId: intent.mailbox_id,
    body: requestBody(intent),
    idempotencyKey: intent.idempotency_key,
  };
  if (intent.effect_type === "REPLY_TO_EMAIL") {
    mutation.emailId = intent.reply_source_email_id;
    mutation.replyAuthority = {
      sourceMailboxId: intent.reply_source_mailbox_id,
      sourceEmailId: intent.reply_source_email_id,
      sourceThreadId: intent.reply_thread_id,
      expectedReplyTarget: intent.expected_reply_target,
    };
  }
  return mutation;
}

export function buildEffectIntent(input) {
  const allowed = [
    "sourcing_id", "round_id", "current_state_digest", "evaluation_digest", "effect_type",
    "mailbox_id", "reply_source_mailbox_id", "reply_source_email_id", "reply_thread_id",
    "expected_reply_target", "to", "from", "subject", "text", "html", "attachments", "purpose",
  ];
  exactKeys(input, allowed, "effect_intent_input");
  requiredKeys(input, ["sourcing_id", "round_id", "current_state_digest", "effect_type", "mailbox_id", "to", "from", "subject", "text", "purpose"], "effect_intent_input");
  const base = {
    sourcing_id: input.sourcing_id,
    round_id: input.round_id,
    current_state_digest: input.current_state_digest,
    evaluation_digest: input.evaluation_digest ?? null,
    effect_type: input.effect_type,
    mailbox_id: input.mailbox_id,
    reply_source_mailbox_id: input.reply_source_mailbox_id ?? null,
    reply_source_email_id: input.reply_source_email_id ?? null,
    reply_thread_id: input.reply_thread_id ?? null,
    expected_reply_target: input.expected_reply_target ?? null,
    to: input.to,
    from: input.from,
    subject: input.subject,
    text: input.text,
    html: input.html ?? null,
    attachments: clone(input.attachments ?? []),
    purpose: input.purpose,
  };
  id(base.sourcing_id, "sourcing_id");
  id(base.round_id, "round_id");
  digest(base.current_state_digest, "current_state_digest");
  const effect_id = `r8-effect-${sha256Canonical(base).slice(0, 24)}`;
  const communication_ref = `EBCSR-${sha256Canonical({ effect_id, sourcing_id: base.sourcing_id, round_id: base.round_id }).slice(0, 16).toUpperCase()}`;
  const exactText = `${base.text}\nReference: ${communication_ref}`;
  const preIntent = {
    effect_schema_version: INTENT_VERSION,
    effect_id,
    ...base,
    text: exactText,
    communication_ref,
  };
  const idempotency_key = `r8-${sha256Canonical(canonicalIntentSeed(preIntent)).slice(0, 48)}`;
  const intent = {
    ...preIntent,
    idempotency_key,
  };
  intent.request_digest = sha256Canonical(canonicalMutation({ ...intent, intent_digest: "0".repeat(64), request_digest: "0".repeat(64) }));
  intent.intent_digest = digestWithout(intent, "intent_digest");
  validateShared(intent, { requireDerived: true });
  return freeze(intent);
}

function canonicalIntentSeed(intent) {
  return {
    effect_type: intent.effect_type,
    effect_id: intent.effect_id,
    mailbox_id: intent.mailbox_id,
    reply_source_mailbox_id: intent.reply_source_mailbox_id,
    reply_source_email_id: intent.reply_source_email_id,
    expected_reply_target: intent.expected_reply_target,
    to: intent.to,
    from: intent.from,
    subject: intent.subject,
    text: intent.text,
    html: intent.html,
    attachments: intent.attachments,
    communication_ref: intent.communication_ref,
  };
}

export function validateEffectIntent(intent) {
  exactKeys(intent, INTENT_KEYS, "effect_intent");
  requiredKeys(intent, INTENT_KEYS, "effect_intent");
  validateShared(intent, { requireDerived: true });
  if (intent.effect_id !== `r8-effect-${sha256Canonical({
    sourcing_id: intent.sourcing_id,
    round_id: intent.round_id,
    current_state_digest: intent.current_state_digest,
    evaluation_digest: intent.evaluation_digest,
    effect_type: intent.effect_type,
    mailbox_id: intent.mailbox_id,
    reply_source_mailbox_id: intent.reply_source_mailbox_id,
    reply_source_email_id: intent.reply_source_email_id,
    reply_thread_id: intent.reply_thread_id,
    expected_reply_target: intent.expected_reply_target,
    to: intent.to,
    from: intent.from,
    subject: intent.subject,
    text: intent.text.replace(/\nReference: EBCSR-[A-F0-9]+$/u, ""),
    html: intent.html,
    attachments: intent.attachments,
    purpose: intent.purpose,
  }).slice(0, 24)}`) fail("EFFECT_ID_MISMATCH", "effect_id is not derived from intent fields");
  const expectedRequest = sha256Canonical(canonicalMutation(intent));
  if (intent.request_digest !== expectedRequest) fail("REQUEST_DIGEST", "request digest does not match canonical mutation");
  if (intent.intent_digest !== digestWithout(intent, "intent_digest")) fail("INTENT_DIGEST", "intent digest does not match intent bytes");
  const expectedComm = `EBCSR-${sha256Canonical({ effect_id: intent.effect_id, sourcing_id: intent.sourcing_id, round_id: intent.round_id }).slice(0, 16).toUpperCase()}`;
  if (intent.communication_ref !== expectedComm || !intent.text.endsWith(`Reference: ${expectedComm}`)) fail("COMMUNICATION_REF", "communication reference is not bound into the exact body");
  const expectedKey = `r8-${sha256Canonical(canonicalIntentSeed(intent)).slice(0, 48)}`;
  if (intent.idempotency_key !== expectedKey) fail("IDEMPOTENCY_KEY", "idempotency key is not derived from the exact intent");
  return true;
}

export function buildPreview(intent) {
  validateEffectIntent(intent);
  const preview = {
    preview_schema_version: PREVIEW_VERSION,
    effect_id: intent.effect_id,
    effect_intent_digest: intent.intent_digest,
    effect_type: intent.effect_type,
    purpose: intent.purpose,
    sourcing_id: intent.sourcing_id,
    round_id: intent.round_id,
    mailbox_id: intent.mailbox_id,
    reply_source_mailbox_id: intent.reply_source_mailbox_id,
    reply_source_email_id: intent.reply_source_email_id,
    reply_thread_id: intent.reply_thread_id,
    expected_reply_target: intent.expected_reply_target,
    from: intent.from,
    to: intent.to,
    subject: intent.subject,
    text: intent.text,
    html: intent.html,
    attachments: clone(intent.attachments),
    communication_ref: intent.communication_ref,
    current_state_digest: intent.current_state_digest,
    evaluation_digest: intent.evaluation_digest,
    request_digest: intent.request_digest,
    preview_digest: null,
  };
  preview.preview_digest = digestWithout(preview, "preview_digest");
  return freeze(preview);
}

export function validatePreview(preview, intent, { currentStateDigest = intent.current_state_digest } = {}) {
  exactKeys(preview, PREVIEW_KEYS, "preview");
  requiredKeys(preview, PREVIEW_KEYS, "preview");
  validateEffectIntent(intent);
  if (preview.preview_schema_version !== PREVIEW_VERSION) fail("PREVIEW_VERSION", "unsupported preview version");
  if (preview.effect_id !== intent.effect_id || preview.effect_intent_digest !== intent.intent_digest) fail("PREVIEW_INTENT", "preview is not bound to intent");
  if (preview.current_state_digest !== currentStateDigest || preview.current_state_digest !== intent.current_state_digest) fail("STALE_STATE", "preview state is stale");
  for (const key of ["effect_type", "purpose", "sourcing_id", "round_id", "mailbox_id", "reply_source_mailbox_id", "reply_source_email_id", "reply_thread_id", "expected_reply_target", "from", "to", "subject", "text", "html", "attachments", "communication_ref", "evaluation_digest", "request_digest"]) {
    if (JSON.stringify(preview[key]) !== JSON.stringify(intent[key])) fail("PREVIEW_DRIFT", `preview field ${key} differs from intent`);
  }
  if (preview.preview_digest !== digestWithout(preview, "preview_digest")) fail("PREVIEW_DIGEST", "preview digest mismatch");
  return true;
}

function candidateSemantic(candidate) {
  return {
    approval_schema_version: candidate.approval_schema_version,
    effect_id: candidate.effect_id,
    effect_intent_digest: candidate.effect_intent_digest,
    preview_digest: candidate.preview_digest,
    request_digest: candidate.request_digest,
    state_digest: candidate.state_digest,
    evaluation_digest: candidate.evaluation_digest,
    actor_ref: candidate.actor_ref,
    expires_at: candidate.expires_at,
    single_use: candidate.single_use,
  };
}

function expectedCandidateId(candidate) {
  return `r8-approval-candidate-${sha256Canonical(candidateSemantic(candidate)).slice(0, 24)}`;
}

function candidateFromRecord(record) {
  return {
    approval_schema_version: APPROVAL_CANDIDATE_VERSION,
    approval_candidate_id: record.approval_candidate_id,
    effect_id: record.effect_id,
    effect_intent_digest: record.effect_intent_digest,
    preview_digest: record.preview_digest,
    request_digest: record.request_digest,
    state_digest: record.state_digest,
    evaluation_digest: record.evaluation_digest,
    actor_ref: record.actor_ref,
    expires_at: record.expires_at,
    single_use: record.single_use,
    candidate_digest: record.candidate_digest,
  };
}

export function buildApprovalCandidate({ intent, preview, actor_ref, expires_at = null }) {
  validateEffectIntent(intent);
  validatePreview(preview, intent);
  const candidate = {
    approval_schema_version: APPROVAL_CANDIDATE_VERSION,
    approval_candidate_id: null,
    effect_id: intent.effect_id,
    effect_intent_digest: intent.intent_digest,
    preview_digest: preview.preview_digest,
    request_digest: intent.request_digest,
    state_digest: intent.current_state_digest,
    evaluation_digest: intent.evaluation_digest,
    actor_ref: id(actor_ref, "actor_ref", { max: 256 }),
    expires_at: expires_at === null ? null : utc(expires_at, "expires_at"),
    single_use: true,
    candidate_digest: null,
  };
  candidate.approval_candidate_id = expectedCandidateId(candidate);
  candidate.candidate_digest = digestWithout(candidate, "candidate_digest");
  return freeze(candidate);
}

export function validateApprovalCandidate(candidate, intent, preview, { currentStateDigest = intent.current_state_digest, evaluationDigest = intent.evaluation_digest, now = null } = {}) {
  exactKeys(candidate, APPROVAL_CANDIDATE_KEYS, "approval_candidate");
  requiredKeys(candidate, APPROVAL_CANDIDATE_KEYS, "approval_candidate");
  validateEffectIntent(intent);
  validatePreview(preview, intent, { currentStateDigest });
  if (candidate.approval_schema_version !== APPROVAL_CANDIDATE_VERSION) fail("APPROVAL_CANDIDATE_VERSION", "unsupported approval candidate version");
  if (candidate.effect_id !== intent.effect_id || candidate.effect_intent_digest !== intent.intent_digest || candidate.preview_digest !== preview.preview_digest || candidate.request_digest !== intent.request_digest) fail("APPROVAL_CANDIDATE_BINDING", "approval candidate is not bound to exact intent/preview");
  if (candidate.state_digest !== currentStateDigest || candidate.state_digest !== intent.current_state_digest) fail("APPROVAL_CANDIDATE_STALE", "approval candidate state is stale");
  if (candidate.evaluation_digest !== evaluationDigest) fail("APPROVAL_EVALUATION", "approval candidate evaluation is stale");
  if (candidate.single_use !== true) fail("APPROVAL_CANDIDATE_SINGLE_USE", "approval candidate must be single-use");
  if (candidate.approval_candidate_id !== expectedCandidateId(candidate)) fail("APPROVAL_CANDIDATE_ID", "approval candidate ID is not derived from immutable candidate fields");
  if (candidate.candidate_digest !== digestWithout(candidate, "candidate_digest")) fail("APPROVAL_CANDIDATE_DIGEST", "approval candidate digest mismatch");
  if (now !== null && candidate.expires_at !== null && Date.parse(now) >= Date.parse(candidate.expires_at)) fail("APPROVAL_CANDIDATE_EXPIRED", "approval candidate has expired");
  return true;
}

export function buildApprovalInput(candidate) {
  exactKeys(candidate, APPROVAL_CANDIDATE_KEYS, "approval_candidate");
  requiredKeys(candidate, APPROVAL_CANDIDATE_KEYS, "approval_candidate");
  if (candidate.approval_schema_version !== APPROVAL_CANDIDATE_VERSION) fail("APPROVAL_CANDIDATE_VERSION", "unsupported approval candidate version");
  return freeze({ approval_candidate_id: candidate.approval_candidate_id, candidate_digest: candidate.candidate_digest, decision: "APPROVE", actor_ref: candidate.actor_ref });
}

export function validateApprovalInput(input, candidate) {
  exactKeys(input, APPROVAL_INPUT_KEYS, "approval_input");
  requiredKeys(input, APPROVAL_INPUT_KEYS, "approval_input");
  if (input.approval_candidate_id !== candidate.approval_candidate_id || input.candidate_digest !== candidate.candidate_digest) fail("APPROVAL_INPUT_BINDING", "approval input is not bound to the presented candidate");
  if (input.decision !== "APPROVE") fail("APPROVAL_NOT_GRANTED", "approval input must explicitly approve the candidate");
  if (input.actor_ref !== candidate.actor_ref) fail("APPROVAL_ACTOR", "approval input actor does not match the candidate actor");
  return true;
}

export function buildApprovalRecord({ candidate, approval_input, approved_at, trusted_host_actor, trusted_session_ref = null }) {
  if (!approval_input) fail("APPROVAL_INPUT_REQUIRED", "approval record requires explicit approval input");
  validateApprovalInput(approval_input, candidate);
  const approvedAt = utc(approved_at, "approved_at");
  const record = {
    approval_schema_version: APPROVAL_VERSION,
    approval_record_id: `r8-approval-record-${sha256Canonical({ approval_candidate_id: candidate.approval_candidate_id, approved_at: approvedAt }).slice(0, 24)}`,
    approval_candidate_id: candidate.approval_candidate_id,
    candidate_digest: candidate.candidate_digest,
    effect_id: candidate.effect_id,
    effect_intent_digest: candidate.effect_intent_digest,
    preview_digest: candidate.preview_digest,
    request_digest: candidate.request_digest,
    state_digest: candidate.state_digest,
    evaluation_digest: candidate.evaluation_digest,
    actor_ref: candidate.actor_ref,
    approved_at: approvedAt,
    trusted_host_actor: id(trusted_host_actor, "trusted_host_actor", { max: 256 }),
    trusted_session_ref: trusted_session_ref === null ? null : string(trusted_session_ref, "trusted_session_ref", { max: 256 }),
    approval_input_digest: sha256Canonical(approval_input),
    expires_at: candidate.expires_at,
    single_use: candidate.single_use,
    approval_digest: null,
  };
  record.approval_digest = digestWithout(record, "approval_digest");
  return freeze(record);
}

export function validateApprovalRecord(record, candidate, intent, preview, { currentStateDigest = intent.current_state_digest, evaluationDigest = intent.evaluation_digest, now = null } = {}) {
  exactKeys(record, APPROVAL_KEYS, "approval_record");
  requiredKeys(record, APPROVAL_KEYS, "approval_record");
  validateApprovalCandidate(candidate, intent, preview, { currentStateDigest, evaluationDigest, now });
  if (record.approval_schema_version !== APPROVAL_VERSION) fail("APPROVAL_VERSION", "unsupported approval record version");
  if (record.approval_candidate_id !== candidate.approval_candidate_id || record.candidate_digest !== candidate.candidate_digest) fail("APPROVAL_RECORD_CANDIDATE", "approval record is not bound to the exact candidate");
  for (const key of ["effect_id", "effect_intent_digest", "preview_digest", "request_digest", "state_digest", "evaluation_digest", "actor_ref", "expires_at", "single_use"]) {
    if (JSON.stringify(record[key]) !== JSON.stringify(candidate[key === "effect_intent_digest" ? "effect_intent_digest" : key])) fail("APPROVAL_RECORD_BINDING", `approval record field ${key} differs from candidate`);
  }
  const approvedAt = utc(record.approved_at, "approved_at");
  if (record.approved_at !== approvedAt) fail("APPROVAL_TIMESTAMP", "approval record timestamp is not canonical UTC");
  if (record.approval_record_id !== `r8-approval-record-${sha256Canonical({ approval_candidate_id: candidate.approval_candidate_id, approved_at: approvedAt }).slice(0, 24)}`) fail("APPROVAL_RECORD_ID", "approval record ID is not derived from candidate and recording time");
  id(record.trusted_host_actor, "trusted_host_actor", { max: 256 });
  if (record.trusted_session_ref !== null) string(record.trusted_session_ref, "trusted_session_ref", { max: 256 });
  digest(record.approval_input_digest, "approval_input_digest");
  if (record.approval_digest !== digestWithout(record, "approval_digest")) fail("APPROVAL_DIGEST", "approval record digest mismatch");
  if (now !== null && record.expires_at !== null && Date.parse(now) >= Date.parse(record.expires_at)) fail("APPROVAL_EXPIRED", "approval record has expired");
  return true;
}

export function validateApproval(approval, intent, preview, options = {}) {
  const candidate = candidateFromRecord(approval);
  return validateApprovalRecord(approval, candidate, intent, preview, options);
}

export function buildApproval({ candidate, approval_input, approved_at, trusted_host_actor, trusted_session_ref = null } = {}) {
  if (!candidate) fail("APPROVAL_CANDIDATE_REQUIRED", "approval record requires a pre-existing approval candidate");
  if (!approval_input) fail("EXPLICIT_APPROVAL_REQUIRED", "approval record requires explicit approval input");
  return buildApprovalRecord({ candidate, approval_input, approved_at, trusted_host_actor, trusted_session_ref });
}

export { INTENT_KEYS, PREVIEW_KEYS, APPROVAL_CANDIDATE_KEYS, APPROVAL_INPUT_KEYS, APPROVAL_KEYS };
