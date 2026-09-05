import { clone, sha256Canonical } from "./core.mjs";
import { buildNormalizedObservation } from "./observation.mjs";

export class FakeMermailAdapter {
  constructor({ scenario = "queued", effectId = "fake-effect", providerMessageId = "fake-provider-1", observationType = "RECIPIENT_MAILBOX", recipientMailboxId = "fake-recipient-mailbox", deliveryStatus = "received" } = {}) {
    this.scenario = scenario;
    this.effectId = effectId;
    this.providerMessageId = providerMessageId;
    this.observationType = observationType;
    this.recipientMailboxId = recipientMailboxId;
    this.deliveryStatus = deliveryStatus;
    this.observer_type = "CONTROLLED_SYNTHETIC_OBSERVER";
    this.authority_boundary = "CONTROLLED_SYNTHETIC_FIXTURE";
    this.calls = [];
    this.logicalEffects = [];
  }

  async dispatch(request, context = {}) {
    this.calls.push(clone(request));
    const call = this.calls.length;
    if (this.scenario === "validation_failed") return { http_status: 200, tool_result: { isError: true, structuredContent: { code: "validation_failed", detail: "from: Invalid input" }, content: [{ type: "text", text: "validation_failed" }] } };
    if (this.scenario === "unauthorized") return { http_status: 401, tool_result: { isError: true, structuredContent: { code: "Unauthorized" } } };
    if (this.scenario === "transport_before") return { transport_error: true, error: { code: "ECONNRESET" } };
    if (this.scenario === "transport_after") {
      this.logicalEffects.push(this.observation(request, context, call));
      return { response_lost: true, transport_error: true };
    }
    if (this.scenario === "malformed") return { http_status: 200 };
    if (this.scenario === "http200_unusable") return { http_status: 200, tool_result: { isError: false, structuredContent: { status: "queued" } } };
    if (this.scenario === "unknown_status") return { http_status: 200, tool_result: { isError: false, structuredContent: { status: "processing_unknown", id: this.effectId } } };
    if (this.scenario === "throws_after_boundary") {
      this.logicalEffects.push(this.observation(request, context, call));
      throw new Error("adapter response lost after external boundary");
    }
    if (this.scenario === "queued") return { http_status: 200, tool_result: { isError: false, structuredContent: { status: "queued", id: this.effectId, message_id: this.providerMessageId } } };
    if (this.scenario === "replay_conflict") return { http_status: 200, tool_result: { isError: true, structuredContent: { code: "idempotency_replay_conflict" }, content: [{ type: "text", text: "idempotency_replay_conflict" }] } };
    return { http_status: 200, tool_result: { isError: true, structuredContent: { code: "capability_rejection" } } };
  }

  observation(request, context, call = 1, overrides = {}) {
    const intent = context.intent ?? {};
    const observationType = overrides.observation_type ?? this.observationType;
    const mailboxId = observationType === "RECIPIENT_MAILBOX" ? (overrides.mailbox_id ?? this.recipientMailboxId) : request.mailboxId;
    const deliveryStatus = observationType === "RECIPIENT_MAILBOX" ? "received" : (overrides.delivery_status ?? (this.deliveryStatus === "received" ? "sent" : this.deliveryStatus));
    return buildNormalizedObservation({
      observation_type: observationType,
      mailbox_id: mailboxId,
      email_id: overrides.email_id ?? `fake-local-${call}`,
      provider_message_id: overrides.provider_message_id ?? this.providerMessageId,
      recipient_mailbox_id: observationType === "RECIPIENT_MAILBOX" ? mailboxId : null,
      recipient_email_id: observationType === "RECIPIENT_MAILBOX" ? (overrides.email_id ?? `fake-local-${call}`) : null,
      recipient_provider_message_id: observationType === "RECIPIENT_MAILBOX" ? (overrides.provider_message_id ?? this.providerMessageId) : null,
      thread_id: intent.reply_thread_id ?? `fake-thread-${call}`,
      from: request.body?.from,
      to: request.body?.to,
      subject: request.body?.subject,
      text: request.body?.text,
      communication_ref: intent.communication_ref,
      delivery_status: deliveryStatus,
      observed_at: overrides.observed_at ?? "2026-09-05T12:00:00.000Z",
      provenance: {
        adapter_class: "FakeMermailAdapter",
        authority_boundary: this.authority_boundary,
        read_operation: "CONTROLLED_SYNTHETIC_OBSERVATION",
        queried_mailbox_id: mailboxId,
      },
    });
  }

  async readObservations(intent) {
    const request = this.calls[0];
    if (!request) return [];
    return [this.observation(request, { intent }, 1)];
  }

  callsDigest() { return sha256Canonical(this.calls); }
}

export function queuedResult(id = "fake-mutation-1") {
  return { http_status: 200, tool_result: { isError: false, structuredContent: { status: "queued", id } } };
}

export function replayConflictResult() {
  return { http_status: 200, tool_result: { isError: true, structuredContent: { code: "idempotency_replay_conflict" } } };
}
