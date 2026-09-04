import { clone, fail } from "./core.mjs";
import { validateEffectIntent } from "./intent.mjs";

function toolPayload(raw) {
  return raw?.tool_result?.structuredContent ?? raw?.structuredContent ?? raw?.result?.structuredContent ?? null;
}

function toolIsError(raw) {
  return raw?.tool_result?.isError === true || raw?.isError === true || raw?.result?.isError === true;
}

export function classifyMermailResult(raw, { dispatchReserved = true } = {}) {
  const payload = toolPayload(raw);
  const contentText = JSON.stringify(raw?.tool_result?.content ?? raw?.content ?? raw?.result?.content ?? "");
  const code = payload?.code ?? payload?.error_code ?? raw?.error?.code ?? null;
  const status = payload?.status ?? null;
  const http = raw?.http_status ?? raw?.httpStatus ?? null;
  if (raw?.transport_error || raw?.connection_lost || raw?.response_lost) {
    return Object.freeze({ classification: "RETURN_AMBIGUOUS", state: "AMBIGUOUS", reason: "TRANSPORT_RESULT_UNKNOWN", raw_summary: { http_status: http, transport_error: raw.transport_error ?? true } });
  }
  if (http !== null && (http < 200 || http >= 300)) {
    return Object.freeze({ classification: "PRE_EXECUTION_REJECTED", state: "PRE_EXECUTION_REJECTED", reason: http === 401 ? "UNAUTHORIZED" : "HTTP_REJECTED", raw_summary: { http_status: http } });
  }
  if (toolIsError(raw) || code) {
    if (["validation_failed", "invalid_request", "Unauthorized", "unauthorized", "capability_rejection", "schema_rejection"].includes(code) || /validation_failed|unauthorized|invalid input|capability/iu.test(contentText)) {
      return Object.freeze({ classification: "PRE_EXECUTION_REJECTED", state: "PRE_EXECUTION_REJECTED", reason: code ?? "TOOL_REJECTED", raw_summary: { http_status: http, code } });
    }
  }
  if (status === "queued" && (payload?.id || payload?.emailId || payload?.message_id || payload?.mutation_id || payload?.local_id)) {
    return Object.freeze({ classification: "MUTATION_ACCEPTED", state: "MUTATION_ACCEPTED", reason: "QUEUED_FOR_PROCESSING", provider_status: "queued", mutation_id: payload.id ?? payload.emailId ?? payload.message_id ?? payload.mutation_id ?? payload.local_id, raw_summary: { http_status: http, status } });
  }
  if (code === "idempotency_replay_conflict" || /idempotency_replay_conflict/iu.test(contentText)) {
    return Object.freeze({ classification: "REPLAY_CONFLICT", state: "MUTATION_ACCEPTED", reason: "IDEMPOTENCY_REPLAY_CONFLICT", replay_conflict: true, raw_summary: { http_status: http, code } });
  }
  if (dispatchReserved) return Object.freeze({ classification: "RETURN_AMBIGUOUS", state: "AMBIGUOUS", reason: "UNPARSEABLE_POST_RESERVATION_RESULT", raw_summary: { http_status: http, status, code } });
  return Object.freeze({ classification: "PRE_EXECUTION_REJECTED", state: "PRE_EXECUTION_REJECTED", reason: "UNPARSEABLE_PRE_RESERVATION_RESULT", raw_summary: { http_status: http, status, code } });
}

function exactBodyMatch(intent, observation) {
  return observation.mailbox_id === intent.mailbox_id
    && observation.to === intent.to
    && observation.from === intent.from
    && observation.subject === intent.subject
    && observation.text === intent.text
    && (observation.communication_ref === intent.communication_ref || String(observation.text ?? "").includes(intent.communication_ref));
}

export function reconcileEffect(intent, observations) {
  validateEffectIntent(intent);
  if (!Array.isArray(observations)) fail("OBSERVATIONS", "observations must be an array");
  const matches = observations.filter((item) => {
    if (!exactBodyMatch(intent, item)) return false;
    if (intent.effect_type === "REPLY_TO_EMAIL") {
      return item.source_mailbox_id === intent.reply_source_mailbox_id
        && item.source_email_id === intent.reply_source_email_id
        && (item.thread_id === intent.reply_thread_id || item.in_reply_to === intent.reply_source_email_id || item.reply_ancestry === "MATCHED");
    }
    return true;
  });
  const providerDelivered = matches.some((item) => item.delivery_status === "provider_delivered" || item.provider_delivered === true);
  const recipientObserved = matches.some((item) => item.recipient_mailbox_observed === true || item.observation_class === "RECIPIENT_MAILBOX");
  let outcome = "NOT_OBSERVED";
  if (matches.length > 1) outcome = "MULTIPLE_MATCHING_EFFECTS";
  else if (matches.length === 1) outcome = "ONE_LOGICAL_EFFECT_OBSERVED";
  return Object.freeze({
    outcome,
    matches: clone(matches),
    logical_effect_count: matches.length,
    provider_delivered: providerDelivered,
    recipient_mailbox_observed: recipientObserved,
    state: matches.length > 1 ? "RECONCILIATION_CONFLICT" : recipientObserved ? "OBSERVED_IN_RECIPIENT_MAILBOX" : providerDelivered ? "OBSERVED_PROVIDER_DELIVERED" : matches.length === 1 ? "MUTATION_ACCEPTED" : "AMBIGUOUS",
    claim: matches.length === 0 ? "NO_AUTHORITATIVE_OBSERVATION_IN_BOUNDED_WINDOW" : matches.length === 1 ? "ONE_MATCHING_LOGICAL_EFFECT" : "MULTIPLE_MATCHING_EFFECTS_REQUIRE_REVIEW",
  });
}

export function classifyReconciliation(result) {
  if (result.outcome === "MULTIPLE_MATCHING_EFFECTS") return "RECONCILIATION_CONFLICT";
  if (result.recipient_mailbox_observed) return "OBSERVED_IN_RECIPIENT_MAILBOX";
  if (result.provider_delivered) return "OBSERVED_PROVIDER_DELIVERED";
  if (result.outcome === "ONE_LOGICAL_EFFECT_OBSERVED") return "MUTATION_ACCEPTED";
  return "AMBIGUOUS";
}

export const liveContractCompatibility = Object.freeze({
  send_queued: "MUTATION_ACCEPTED",
  reply_queued: "MUTATION_ACCEPTED",
  replay_conflict: "REPLAY_CONFLICT_WITH_NO_SECOND_EFFECT_IN_BOUNDED_TRIAL",
  queued_is_delivered: false,
  provider_delivered_is_recipient_observed: false,
  reply_authority: "mailboxId + mailbox-local emailId",
});
