import { createHash } from "node:crypto";
import { buildNotice, decide } from "../skills/mermail-work-handoff/scripts/decide.mjs";

export const ARTIFACT_DIGEST = `sha256:${createHash("sha256").update("synthetic-artifact-v1").digest("hex")}`;

export function basePacket(overrides = {}) {
  const packet = {
    intent: "prepare",
    task: {
      id: "synthetic-finished-work",
      predicates: [
        { id: "received", text: "The worker artifact is the bytes named in this packet." },
        { id: "open", text: "The requester has not accepted those bytes." },
      ],
      effort: { max_revisions: 1, revision_predicate_ids: ["open"] },
    },
    artifact: { digest: ARTIFACT_DIGEST, label: "synthetic-artifact-v1" },
    requester: { address: "requester@example.com" },
    prior: {
      delivery_message_ids: [],
      reply_message_ids: [],
      artifact_digests_delivered: [],
      revisions_used: 0,
    },
  };
  return merge(packet, overrides);
}

export function deliveryFor(packet, messageId = "msg-delivery-1") {
  const notice = buildNotice(packet.task, packet.artifact, packet.requester);
  return {
    message_id: messageId,
    artifact_digest: packet.artifact.digest,
    predicate_ids: packet.task.predicates.map((predicate) => predicate.id),
    notice_digest: notice.notice_digest,
  };
}

export function replyFor(overrides = {}) {
  return {
    message_id: "msg-reply-1",
    folder_id: "inbox",
    from: "Requester <requester@example.com>",
    sender_authentication: { status: "pass" },
    scan_status: "clean",
    text: `ACCEPT ${ARTIFACT_DIGEST}`,
    ...overrides,
  };
}

function merge(target, overrides) {
  const output = { ...target, ...overrides };
  if (overrides.task) output.task = { ...target.task, ...overrides.task };
  if (overrides.artifact) output.artifact = { ...target.artifact, ...overrides.artifact };
  if (overrides.requester) output.requester = { ...target.requester, ...overrides.requester };
  if (overrides.prior) output.prior = { ...target.prior, ...overrides.prior };
  return output;
}

export function expectDecision(packet, expected) {
  const decision = decide(packet);
  const mismatches = [];
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(decision[key]) !== JSON.stringify(value)) {
      mismatches.push(`${key}: ${JSON.stringify(decision[key])}`);
    }
  }
  return { decision, mismatches };
}
