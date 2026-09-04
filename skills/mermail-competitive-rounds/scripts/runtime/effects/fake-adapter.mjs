import { clone, sha256Canonical } from "./core.mjs";

export class FakeMermailAdapter {
  constructor({ scenario = "queued", effectId = "fake-effect", providerMessageId = "fake-provider-1" } = {}) {
    this.scenario = scenario;
    this.effectId = effectId;
    this.providerMessageId = providerMessageId;
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
    return {
      mailbox_id: request.mailboxId,
      email_id: `fake-local-${call}`,
      thread_id: intent.reply_thread_id ?? `fake-thread-${call}`,
      provider_message_id: this.providerMessageId,
      from: request.body?.from,
      to: request.body?.to,
      subject: request.body?.subject,
      text: request.body?.text,
      communication_ref: intent.communication_ref,
      delivery_status: overrides.delivery_status ?? "queued",
      provider_delivered: overrides.provider_delivered ?? false,
      recipient_mailbox_observed: overrides.recipient_mailbox_observed ?? false,
      observation_class: overrides.observation_class ?? "PROVIDER",
      ...overrides,
    };
  }

  callsDigest() { return sha256Canonical(this.calls); }
}

export function queuedResult(id = "fake-mutation-1") {
  return { http_status: 200, tool_result: { isError: false, structuredContent: { status: "queued", id } } };
}

export function replayConflictResult() {
  return { http_status: 200, tool_result: { isError: true, structuredContent: { code: "idempotency_replay_conflict" } } };
}
