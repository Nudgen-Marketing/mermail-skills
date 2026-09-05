import { DirectMermailAdapter } from "./mcp/direct-mcp-adapter.mjs";
import { executeEffect, reconcileAndRecord } from "./effects/gateway.mjs";
import { fail } from "./effects/core.mjs";

export function assertAdapterForMode(mode, adapter) {
  if (mode === "live") {
    if (!(adapter instanceof DirectMermailAdapter) || adapter.observer_type !== "TRUSTED_READ_ONLY_MERMAIL_ADAPTER") fail("LIVE_ADAPTER_REQUIRED", "live competitive-round execution requires DirectMermailAdapter and cannot fall back to a fake adapter");
  } else if (mode === "controlled") {
    if (adapter?.observer_type !== "CONTROLLED_SYNTHETIC_OBSERVER" || adapter?.authority_boundary !== "CONTROLLED_SYNTHETIC_FIXTURE") fail("CONTROLLED_ADAPTER_REQUIRED", "controlled execution requires an explicit synthetic adapter");
  } else fail("EXECUTION_MODE", "competitive-round execution mode must be live or controlled");
  if (typeof adapter.dispatch !== "function" || typeof adapter.readObservations !== "function") fail("ADAPTER_INTERFACE", "selected adapter must provide dispatch and readObservations");
  return true;
}

async function runWithAdapter({ root, intent, preview, approval_candidate, approval, adapter, observer, preflight, current_state_digest, evaluation_digest, allowedRecipient, failpoint, command_id, recorded_at, freshProcessCheck = null }) {
  const result = await executeEffect({ root, intent, preview, approval_candidate, approval, adapter, preflight, current_state_digest, evaluation_digest, allowedRecipient, failpoint, recorded_at });
  const reconciliation = await reconcileAndRecord({ root, intent, observer, recorded_at });
  const replay = await executeEffect({ root, intent, preview, approval_candidate, approval, adapter, preflight, current_state_digest, evaluation_digest, allowedRecipient, command_id, recorded_at });
  return Object.freeze({ result, reconciliation, replay, adapter_calls: adapter.dispatchCount ?? adapter.calls?.length ?? null, fresh_process_check: freshProcessCheck });
}

/**
 * Narrow Skill-facing boundary. Policy/evidence/durability kernels remain shared;
 * only the adapter is selected here. Live mode is trusted-host code and never
 * silently falls back to the controlled adapter.
 */
export async function runCompetitiveRound({
  mode = "live",
  root,
  intent,
  preview,
  approval_candidate,
  approval,
  adapter = null,
  observer = null,
  preflight = null,
  recipientMailboxId = null,
  buyerMailboxEmail = null,
  current_state_digest = undefined,
  evaluation_digest = undefined,
  allowedRecipient = null,
  failpoint = null,
  command_id = null,
  recorded_at,
} = {}) {
  if (mode === "live" && !approval) return Object.freeze({ outcome: "APPROVAL_NEEDED", state: "NOT_AUTHORIZED", adapter_called: false, reason: "EXACT_APPROVAL_RECORD_REQUIRED_BEFORE_LIVE_ADAPTER_CONNECTION" });
  if (mode === "live" && (!recipientMailboxId || !buyerMailboxEmail)) return Object.freeze({ outcome: "PRECONDITION_BLOCKED", state: "NOT_AUTHORIZED", adapter_called: false, reason: "LIVE_MAILBOX_BINDING_REQUIRED_BEFORE_ADAPTER_CONNECTION" });

  let selected = adapter;
  let selectedObserver = observer;
  let selectedPreflight = preflight;
  let connection = null;
  try {
    if (mode === "live") {
      connection = await DirectMermailAdapter.connect({ writeEnabled: true, recipientMailboxId });
      selected = connection.adapter;
      selectedObserver = selected;
      selectedPreflight = (input) => selected.preflight({
        mailboxId: intent.mailbox_id,
        mailboxEmail: buyerMailboxEmail,
        recipient: recipientMailboxId,
        communicationRef: intent.communication_ref,
        subject: intent.subject,
        currentStateDigest: intent.current_state_digest,
        ...input,
      });
    }
    assertAdapterForMode(mode, selected);
    if (!selectedObserver) selectedObserver = selected;
    if (typeof selectedPreflight !== "function") fail("PREFLIGHT_REQUIRED", "selected competitive-round adapter requires a fresh authority preflight");
    return await runWithAdapter({ root, intent, preview, approval_candidate, approval, adapter: selected, observer: selectedObserver, preflight: selectedPreflight, current_state_digest, evaluation_digest, allowedRecipient, failpoint, command_id, recorded_at });
  } finally {
    await connection?.adapter?.close?.().catch(() => {});
  }
}
