import { assertEgress } from "./egress.mjs";
import { buildApprovalCandidate, buildApprovalRecord, buildPreview, canonicalMutation, validateApprovalCandidate, validateApprovalInput, validateApprovalRecord, validateEffectIntent, validatePreview } from "./intent.mjs";
import { appendCommand, command, journalPaths, putArtifact, readBundle } from "./ledger.mjs";
import { classifyMermailResult, classifyReconciliation, reconcileEffect } from "./adapter.mjs";
import { fail } from "./core.mjs";

async function currentBundle(root, sourcingId) {
  return readBundle(root, { sourcing_id: sourcingId });
}

function effectState(bundle, effectId) {
  return bundle.state?.effects?.[effectId] ?? null;
}

function resultFromState(effect) {
  return Object.freeze({
    outcome: "ALREADY_RECORDED",
    effect_id: effect.effect_id,
    state: effect.state,
    reservation_count: effect.reservation_count,
    attempt_count: effect.attempt_count,
    terminal_result: effect.terminal_result,
    observations: effect.observations,
    adapter_called: false,
  });
}

function commandId(prefix, effectId) {
  return `${prefix}:${effectId}`;
}

export async function createEffect({ root, intent, command_id = null, recorded_at } = {}) {
  validateEffectIntent(intent);
  const bundle = await currentBundle(root, intent.sourcing_id);
  const pendingCollision = Object.values(bundle.state?.effects ?? {}).find((effect) =>
    effect.effect_id !== intent.effect_id
    && effect.request_digest === intent.request_digest
    && ["DISPATCH_RESERVED", "AMBIGUOUS"].includes(effect.state));
  if (pendingCollision) fail("EFFECT_SEMANTIC_COLLISION", "an equivalent external effect is unresolved; a new effect identity cannot bypass it", { existing_effect_id: pendingCollision.effect_id, request_digest: intent.request_digest });
  const artifact = await putArtifact(root, intent, "EFFECT_INTENT");
  const requestArtifact = await putArtifact(root, canonicalMutation(intent), "EFFECT_REQUEST");
  const result = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: command_id ?? commandId("intent", intent.effect_id),
    command_type: "EFFECT_INTENT_CREATED",
    effect_id: intent.effect_id,
    payload: { intent_digest: intent.intent_digest, current_state_digest: intent.current_state_digest, request_digest: intent.request_digest },
    artifact_refs: [artifact, requestArtifact],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { recorded_at });
  return Object.freeze({ artifact, request_artifact: requestArtifact, journal: result, intent });
}

export async function previewEffect({ root, intent, allowedRecipient = null, command_id = null, recorded_at } = {}) {
  validateEffectIntent(intent);
  const egress = assertEgress(intent, { allowedRecipient });
  const preview = buildPreview(intent);
  const artifact = await putArtifact(root, preview, "EFFECT_PREVIEW");
  const bundle = await currentBundle(root, intent.sourcing_id);
  const effect = effectState(bundle, intent.effect_id);
  if (!effect || effect.state !== "NOT_AUTHORIZED") fail("PREVIEW_NOT_ALLOWED", "effect intent has not been created or is no longer previewable");
  const journal = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: command_id ?? commandId("preview", intent.effect_id),
    command_type: "EFFECT_PREVIEWED",
    effect_id: intent.effect_id,
    payload: { intent_digest: intent.intent_digest, preview_digest: preview.preview_digest, current_state_digest: intent.current_state_digest },
    artifact_refs: [artifact],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { recorded_at });
  return Object.freeze({ preview, artifact, journal, egress });
}

export async function prepareApprovalCandidate({ root, intent, preview, actor_ref, expires_at = null } = {}) {
  validatePreview(preview, intent);
  const bundle = await currentBundle(root, intent.sourcing_id);
  const effect = effectState(bundle, intent.effect_id);
  if (!effect || effect.state !== "PREVIEWED") fail("CANDIDATE_NOT_ALLOWED", "approval candidate requires a current previewed effect");
  const candidate = buildApprovalCandidate({ intent, preview, actor_ref, expires_at });
  const artifact = await putArtifact(root, candidate, "EFFECT_APPROVAL_CANDIDATE");
  return Object.freeze({ candidate, artifact });
}

export async function approveEffect({ root, intent, preview, candidate, approval_input, approved_at, trusted_host_actor, trusted_session_ref = null, command_id = null, recorded_at } = {}) {
  validatePreview(preview, intent);
  if (!candidate) fail("APPROVAL_CANDIDATE_REQUIRED", "approval requires the exact pre-existing candidate");
  if (!approval_input) fail("EXPLICIT_APPROVAL_REQUIRED", "approval requires explicit user approval input");
  validateApprovalCandidate(candidate, intent, preview);
  validateApprovalInput(approval_input, candidate);
  const approval = buildApprovalRecord({ candidate, approval_input, approved_at, trusted_host_actor, trusted_session_ref });
  const bundle = await currentBundle(root, intent.sourcing_id);
  const effect = effectState(bundle, intent.effect_id);
  if (!effect || effect.state !== "PREVIEWED") fail("APPROVAL_NOT_ALLOWED", "effect is not currently previewed");
  const candidateArtifact = await putArtifact(root, candidate, "EFFECT_APPROVAL_CANDIDATE");
  const artifact = await putArtifact(root, approval, "EFFECT_APPROVAL");
  const journal = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: command_id ?? commandId("approval", intent.effect_id),
    command_type: "EFFECT_APPROVED",
    effect_id: intent.effect_id,
    payload: { preview_digest: preview.preview_digest, approval_candidate_digest: candidate.candidate_digest, approval_digest: approval.approval_digest },
    artifact_refs: [candidateArtifact, artifact],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { recorded_at });
  return Object.freeze({ candidate, candidate_artifact: candidateArtifact, approval, artifact, journal });
}

function ensureCurrentState(intent, current_state_digest) {
  if (current_state_digest !== undefined && current_state_digest !== intent.current_state_digest) fail("STALE_STATE", "effect intent is bound to a different current R6 state digest");
}

export async function executeEffect({ root, intent, preview, approval_candidate, approval, current_state_digest = undefined, evaluation_digest = undefined, adapter, preflight = null, allowedRecipient = null, failpoint = null, command_id = null, recorded_at } = {}) {
  validateEffectIntent(intent);
  validatePreview(preview, intent, { currentStateDigest: current_state_digest ?? intent.current_state_digest });
  if (!approval_candidate) fail("APPROVAL_CANDIDATE_REQUIRED", "execution requires the exact approved candidate");
  validateApprovalRecord(approval, approval_candidate, intent, preview, { currentStateDigest: current_state_digest ?? intent.current_state_digest, evaluationDigest: evaluation_digest ?? intent.evaluation_digest });
  ensureCurrentState(intent, current_state_digest);
  const egress = assertEgress(intent, { allowedRecipient });
  if (!adapter || typeof adapter.dispatch !== "function") fail("ADAPTER_REQUIRED", "effect execution requires an explicit Mermail adapter");
  if (typeof preflight !== "function") fail("PREFLIGHT_REQUIRED", "effect execution requires a fresh authority/profile preflight");
  const preflightResult = await preflight({ intent, preview, approval });
  if (preflightResult?.allowed !== true || preflightResult.current_state_digest !== intent.current_state_digest) {
    return Object.freeze({ outcome: "PRECONDITION_BLOCKED", effect_id: intent.effect_id, state: "NOT_AUTHORIZED", adapter_called: false, preflight: preflightResult });
  }
  let bundle = await currentBundle(root, intent.sourcing_id);
  const effect = effectState(bundle, intent.effect_id);
  if (!effect) fail("EFFECT_NOT_FOUND", "effect intent has not been durably created");
  if (["PRE_EXECUTION_REJECTED", "MUTATION_ACCEPTED", "AMBIGUOUS", "OBSERVED_PROVIDER_DELIVERED", "OBSERVED_IN_RECIPIENT_MAILBOX", "RECONCILIATION_CONFLICT"].includes(effect.state)) return resultFromState(effect);
  if (effect.state === "DISPATCH_RESERVED") return Object.freeze({ outcome: "AMBIGUOUS", effect_id: intent.effect_id, state: "AMBIGUOUS", reason: "RESERVATION_EXISTS_RECONCILIATION_REQUIRED", adapter_called: false });
  if (effect.state !== "APPROVED") fail("DISPATCH_NOT_APPROVED", "effect is not durably approved");
  const reservation = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: command_id ?? commandId("dispatch", intent.effect_id),
    command_type: "EFFECT_DISPATCH_RESERVED",
    effect_id: intent.effect_id,
    payload: { approval_candidate_digest: approval_candidate.candidate_digest, approval_digest: approval.approval_digest, request_digest: intent.request_digest },
    artifact_refs: [],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { failpoint: failpoint === "AFTER_RESERVATION_BEFORE_ADAPTER" ? "AFTER_EVENT_FSYNC_BEFORE_CHECKPOINT" : null, recorded_at });
  if (failpoint === "AFTER_RESERVATION_BEFORE_ADAPTER") return Object.freeze({ outcome: "AMBIGUOUS", effect_id: intent.effect_id, state: "AMBIGUOUS", reason: "CRASH_AFTER_RESERVATION_BEFORE_ADAPTER", reservation, adapter_called: false });
  if (reservation.duplicate) {
    const latest = await currentBundle(root, intent.sourcing_id);
    const latestEffect = effectState(latest, intent.effect_id);
    if (latestEffect && ["PRE_EXECUTION_REJECTED", "MUTATION_ACCEPTED", "AMBIGUOUS", "OBSERVED_PROVIDER_DELIVERED", "OBSERVED_IN_RECIPIENT_MAILBOX", "RECONCILIATION_CONFLICT"].includes(latestEffect.state)) return resultFromState(latestEffect);
    return Object.freeze({ outcome: "AMBIGUOUS", effect_id: intent.effect_id, state: "AMBIGUOUS", reason: "RESERVATION_EXISTS_RECONCILIATION_REQUIRED", reservation, adapter_called: false });
  }
  const request = canonicalMutation(intent);
  let raw;
  try { raw = await adapter.dispatch(request, { intent, preview, approval }); }
  catch (error) { raw = { transport_error: true, error: { name: error.name, message: error.message } }; }
  if (failpoint === "AFTER_ADAPTER_BEFORE_RESULT") return Object.freeze({ outcome: "AMBIGUOUS", effect_id: intent.effect_id, state: "DISPATCH_RESERVED", reason: "CRASH_AFTER_ADAPTER_BEFORE_RESULT", raw, reservation, adapter_called: true });
  const classification = classifyMermailResult(raw, { dispatchReserved: true });
  const rawArtifact = await putArtifact(root, { request, raw }, "EFFECT_RAW_RESULT");
  bundle = await currentBundle(root, intent.sourcing_id);
  const resultJournal = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: commandId("result", intent.effect_id),
    command_type: "EFFECT_RESULT_RECORDED",
    effect_id: intent.effect_id,
    payload: { classification: classification.classification === "REPLAY_CONFLICT" ? "MUTATION_ACCEPTED" : classification.classification, reason: classification.reason, mutation_id: classification.mutation_id ?? null },
    artifact_refs: [rawArtifact],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { recorded_at });
  return Object.freeze({ outcome: classification.classification, effect_id: intent.effect_id, state: classification.state, classification, raw, raw_artifact: rawArtifact, reservation, result_journal: resultJournal, egress, adapter_called: true });
}

export async function reconcileAndRecord({ root, intent, observations, command_id = null, recorded_at } = {}) {
  const reconciliation = reconcileEffect(intent, observations);
  const observationArtifact = await putArtifact(root, { intent_effect_id: intent.effect_id, observations, reconciliation }, "EFFECT_OBSERVATION");
  const bundle = await currentBundle(root, intent.sourcing_id);
  const eventType = reconciliation.outcome === "MULTIPLE_MATCHING_EFFECTS" ? "EFFECT_RECONCILIATION_CONFLICT" : "EFFECT_OBSERVATION_RECORDED";
  const journal = await appendCommand(root, command({
    sourcing_id: intent.sourcing_id,
    command_id: command_id ?? commandId("observation", `${intent.effect_id}:${reconciliation.outcome}:${reconciliation.logical_effect_count}`),
    command_type: "EFFECT_OBSERVATION_RECORDED",
    effect_id: intent.effect_id,
    payload: { reconciliation_digest: observationArtifact.digest, outcome: reconciliation.outcome, logical_effect_count: reconciliation.logical_effect_count, state: classifyReconciliation(reconciliation), event_type: eventType },
    artifact_refs: [observationArtifact],
    expected_head_event_digest: bundle.state.head_event_digest,
  }), { recorded_at });
  return Object.freeze({ reconciliation, artifact: observationArtifact, journal });
}

export async function readEffect(root, sourcingId, effectId) {
  const bundle = await currentBundle(root, sourcingId);
  return Object.freeze({ bundle, effect: effectState(bundle, effectId), paths: journalPaths(root) });
}
