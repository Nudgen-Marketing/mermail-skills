import {
  address,
  digest,
  digestWithout,
  exactKeys,
  fail,
  freeze,
  nullableString,
  requiredKeys,
  sha256Canonical,
  string,
  utc,
} from "./core.mjs";

export const OBSERVATION_VERSION = "r8.effect-observation.v2";
export const OBSERVATION_TYPES = Object.freeze(["PROVIDER", "RECIPIENT_MAILBOX"]);
export const PROVIDER_DELIVERY_STATES = Object.freeze(["queued", "sent", "provider_delivered"]);

const PROVENANCE_KEYS = ["adapter_class", "authority_boundary", "read_operation", "queried_mailbox_id", "source_digest"];
const OBSERVATION_KEYS = [
  "observation_schema_version", "observation_type", "mailbox_id", "email_id", "provider_message_id",
  "recipient_mailbox_id", "recipient_email_id", "recipient_provider_message_id", "source_mailbox_id",
  "source_email_id", "thread_id", "in_reply_to", "reply_ancestry", "from", "to", "subject", "text",
  "body_digest", "communication_ref", "delivery_status", "observed_at", "provenance", "observation_digest",
];

function nullableId(value, path) {
  return value === null ? null : string(value, path, { max: 512 });
}

function validateProvenance(provenance) {
  exactKeys(provenance, PROVENANCE_KEYS, "observation.provenance");
  requiredKeys(provenance, PROVENANCE_KEYS, "observation.provenance");
  string(provenance.adapter_class, "observation.provenance.adapter_class", { max: 128 });
  string(provenance.authority_boundary, "observation.provenance.authority_boundary", { max: 128 });
  string(provenance.read_operation, "observation.provenance.read_operation", { max: 128 });
  string(provenance.queried_mailbox_id, "observation.provenance.queried_mailbox_id", { max: 512 });
  digest(provenance.source_digest, "observation.provenance.source_digest");
}

export function validateNormalizedObservation(observation) {
  exactKeys(observation, OBSERVATION_KEYS, "observation");
  requiredKeys(observation, OBSERVATION_KEYS, "observation");
  if (observation.observation_schema_version !== OBSERVATION_VERSION) fail("OBSERVATION_VERSION", "unsupported normalized observation version");
  if (!OBSERVATION_TYPES.includes(observation.observation_type)) fail("OBSERVATION_TYPE", "unsupported normalized observation type");
  string(observation.mailbox_id, "observation.mailbox_id", { max: 512 });
  string(observation.email_id, "observation.email_id", { max: 512 });
  nullableId(observation.provider_message_id, "observation.provider_message_id");
  nullableId(observation.recipient_mailbox_id, "observation.recipient_mailbox_id");
  nullableId(observation.recipient_email_id, "observation.recipient_email_id");
  nullableId(observation.recipient_provider_message_id, "observation.recipient_provider_message_id");
  nullableId(observation.source_mailbox_id, "observation.source_mailbox_id");
  nullableId(observation.source_email_id, "observation.source_email_id");
  nullableId(observation.thread_id, "observation.thread_id");
  nullableId(observation.in_reply_to, "observation.in_reply_to");
  nullableString(observation.reply_ancestry, "observation.reply_ancestry", { max: 128 });
  address(observation.from, "observation.from");
  address(observation.to, "observation.to");
  string(observation.subject, "observation.subject", { max: 998 });
  string(observation.text, "observation.text", { max: 10000 });
  digest(observation.body_digest, "observation.body_digest");
  string(observation.communication_ref, "observation.communication_ref", { max: 128 });
  if (observation.observation_type === "RECIPIENT_MAILBOX") {
    if (observation.recipient_mailbox_id !== observation.mailbox_id || observation.recipient_email_id !== observation.email_id) fail("RECIPIENT_ID_BINDING", "recipient observation must bind its queried mailbox-local identity");
    if (observation.delivery_status !== "received") fail("RECIPIENT_DELIVERY_STATE", "recipient observation delivery state must be derived as received");
  } else if (!PROVIDER_DELIVERY_STATES.includes(observation.delivery_status)) {
    fail("PROVIDER_DELIVERY_STATE", "provider observation delivery state is not supported");
  }
  if (observation.body_digest !== sha256Canonical(observation.text)) fail("OBSERVATION_BODY_DIGEST", "observation body digest does not match content");
  utc(observation.observed_at, "observation.observed_at");
  validateProvenance(observation.provenance);
  if (observation.observation_digest !== digestWithout(observation, "observation_digest")) fail("OBSERVATION_DIGEST", "normalized observation digest mismatch");
  return true;
}

export function buildNormalizedObservation({
  observation_type,
  mailbox_id,
  email_id,
  provider_message_id = null,
  recipient_mailbox_id = null,
  recipient_email_id = null,
  recipient_provider_message_id = null,
  source_mailbox_id = null,
  source_email_id = null,
  thread_id = null,
  in_reply_to = null,
  reply_ancestry = null,
  from,
  to,
  subject,
  text,
  communication_ref,
  delivery_status,
  observed_at,
  provenance,
} = {}) {
  const observation = {
    observation_schema_version: OBSERVATION_VERSION,
    observation_type,
    mailbox_id,
    email_id,
    provider_message_id,
    recipient_mailbox_id,
    recipient_email_id,
    recipient_provider_message_id,
    source_mailbox_id,
    source_email_id,
    thread_id,
    in_reply_to,
    reply_ancestry,
    from,
    to,
    subject,
    text,
    body_digest: sha256Canonical(text),
    communication_ref,
    delivery_status,
    observed_at,
    provenance: { ...provenance, source_digest: provenance?.source_digest ?? sha256Canonical({ mailbox_id, email_id, provider_message_id, from, to, subject, text, communication_ref, delivery_status }) },
    observation_digest: null,
  };
  observation.observation_digest = digestWithout(observation, "observation_digest");
  validateNormalizedObservation(observation);
  return freeze(observation);
}

export function normalizeReadObservation({ raw, observation_type, mailbox_id, adapter_class, authority_boundary, read_operation, observed_at, communication_ref = null, recipient_mailbox_id = null }) {
  if (!raw || typeof raw !== "object") fail("READ_OBSERVATION", "read result candidate must be an object");
  const body = typeof raw.text === "string" ? raw.text : typeof raw.body === "string" ? raw.body : typeof raw.body?.text === "string" ? raw.body.text : typeof raw.content === "string" ? raw.content : null;
  const emailId = raw.email_id ?? raw.emailId ?? raw.public_id ?? raw.id ?? null;
  if (typeof body !== "string" || typeof emailId !== "string") fail("READ_OBSERVATION_SHAPE", "read result must expose body text and mailbox-local email ID");
  const providerMessageId = raw.provider_message_id ?? raw.providerMessageId ?? raw.rfc_message_id ?? raw.message_id ?? raw.messageId ?? null;
  const recipientMailbox = observation_type === "RECIPIENT_MAILBOX" ? (recipient_mailbox_id ?? mailbox_id) : null;
  const deliveryStatus = observation_type === "RECIPIENT_MAILBOX"
    ? "received"
    : raw.delivery_status ?? raw.provider_delivery_status ?? (raw.status === "provider_delivered" ? "provider_delivered" : raw.status === "queued" ? "queued" : "sent");
  return buildNormalizedObservation({
    observation_type,
    mailbox_id,
    email_id: emailId,
    provider_message_id: providerMessageId,
    recipient_mailbox_id: recipientMailbox,
    recipient_email_id: observation_type === "RECIPIENT_MAILBOX" ? emailId : null,
    recipient_provider_message_id: observation_type === "RECIPIENT_MAILBOX" ? providerMessageId : null,
    source_mailbox_id: raw.source_mailbox_id ?? null,
    source_email_id: raw.source_email_id ?? raw.in_reply_to ?? null,
    thread_id: raw.thread_id ?? raw.threadId ?? null,
    in_reply_to: raw.in_reply_to ?? raw.inReplyTo ?? null,
    reply_ancestry: raw.reply_ancestry ?? null,
    from: raw.from?.email ?? raw.from,
    to: raw.to?.email ?? raw.to,
    subject: raw.subject,
    text: body,
    communication_ref: raw.communication_ref ?? raw.communicationRef ?? communication_ref ?? "UNBOUND_READ_RESULT",
    delivery_status: deliveryStatus,
    observed_at,
    provenance: { adapter_class, authority_boundary, read_operation, queried_mailbox_id: mailbox_id, source_digest: sha256Canonical(raw) },
  });
}

export function validateObserverBoundary(observer) {
  if (!observer || typeof observer.readObservations !== "function") fail("OBSERVER_REQUIRED", "reconciliation requires an explicit read-only observer");
  if (!["TRUSTED_READ_ONLY_MERMAIL_ADAPTER", "CONTROLLED_SYNTHETIC_OBSERVER"].includes(observer.observer_type)) fail("OBSERVER_BOUNDARY", "observer must identify a trusted live adapter or explicit controlled synthetic observer");
  if (observer.observer_type === "TRUSTED_READ_ONLY_MERMAIL_ADAPTER" && observer.authority_boundary !== "DIRECT_MERMAIL_READ_ONLY_ADAPTER") fail("OBSERVER_BOUNDARY", "live observer boundary is not the direct read-only Mermail adapter");
  if (observer.observer_type === "CONTROLLED_SYNTHETIC_OBSERVER" && observer.authority_boundary !== "CONTROLLED_SYNTHETIC_FIXTURE") fail("OBSERVER_BOUNDARY", "synthetic observer boundary is not explicit");
  return true;
}
