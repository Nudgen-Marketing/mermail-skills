import { promises as fs } from "node:fs";
import { readJournal, validateCheckpoint, validateStoredEventArtifacts } from "./journal.mjs";
import { reduceEvents, stateDigest } from "./reducer.mjs";
import { genesisDigest, validateEventEnvelope } from "./event-schema.mjs";
import { errorCode } from "./errors.mjs";

export const VERIFIER_OUTCOMES = Object.freeze([
  "VALID_CURRENT_HEAD",
  "VALID_INTERNAL_CHAIN_NO_EXTERNAL_COMPLETENESS_PROOF",
  "RECOVERABLE_TORN_TAIL",
  "CHECKPOINT_LAG",
  "JOURNAL_BEHIND_CHECKPOINT",
  "JOURNAL_TRUNCATED_OR_LOST",
  "CHAIN_CORRUPTION",
  "ARTIFACT_MISSING",
  "ARTIFACT_DIGEST_MISMATCH",
  "ARTIFACT_CONTENT_INVALID",
  "COMMAND_REPLAY_CONFLICT",
  "UNKNOWN_EVENT_SCHEMA",
  "UNKNOWN_EVENT_TYPE",
  "STATE_REPLAY_MISMATCH",
  "CHECKPOINT_CORRUPTION",
  "JOURNAL_NOT_INITIALIZED",
]);

function result(outcome, details = {}) {
  return Object.freeze({ outcome, ...details });
}

function classifyError(error) {
  const code = errorCode(error);
  if (code === "COMMAND_REPLAY_CONFLICT") return "COMMAND_REPLAY_CONFLICT";
  if (code === "UNKNOWN_EVENT_TYPE") return "UNKNOWN_EVENT_TYPE";
  if (code === "EVENT_VERSION") return "UNKNOWN_EVENT_SCHEMA";
  if (["EVENT_DIGEST_MISMATCH", "EVENT_ID_MISMATCH", "PAYLOAD_DIGEST_MISMATCH", "CHAIN_LINK_MISMATCH", "SEQUENCE_ERROR", "DUPLICATE_COMMAND_ID", "AUTHORITY_CLASS_MISMATCH", "PRODUCER_MISMATCH"].includes(code)) return "CHAIN_CORRUPTION";
  if (code === "ARTIFACT_MISSING" || error?.code === "ENOENT") return "ARTIFACT_MISSING";
  if (code === "ARTIFACT_DIGEST_MISMATCH") return "ARTIFACT_DIGEST_MISMATCH";
  if (["INVALID_ARTIFACT_CONTENT", "ARTIFACT_EVENT_MISMATCH", "ARTIFACT_NOT_JSON", "OUTPUT_DIGEST_MISMATCH", "EVIDENCE_DIGEST_MISMATCH", "SNAPSHOT_DIGEST_MISMATCH"].includes(code)) return "ARTIFACT_CONTENT_INVALID";
  if (code.startsWith("CHECKPOINT")) return "CHECKPOINT_CORRUPTION";
  if (code === "JOURNAL_NOT_INITIALIZED") return "JOURNAL_NOT_INITIALIZED";
  return "CHAIN_CORRUPTION";
}

function checkpointMatchesPrefix(checkpoint, events, state) {
  const count = checkpoint.expected_event_count;
  const expectedHead = count === 0 ? genesisDigest(checkpoint.sourcing_id) : events[count - 1]?.event_digest;
  return expectedHead === checkpoint.expected_head_event_digest && state.journal.event_count === count && state.journal.head_event_digest === checkpoint.expected_head_event_digest && state.state_digest === checkpoint.expected_state_digest;
}

export async function verifyJournal(root, { sourcing_id = null } = {}) {
  let document;
  try {
    document = await readJournal(root, { sourcing_id });
  } catch (error) {
    return result(classifyError(error), { error_code: errorCode(error), message: error.message, read_only: true });
  }
  if (document.checkpoint_error) return result("CHECKPOINT_CORRUPTION", { error_code: document.checkpoint_error.code, message: document.checkpoint_error.message, read_only: true });
  const resolvedSourcingId = sourcing_id ?? document.checkpoint?.sourcing_id ?? document.events[0]?.sourcing_id ?? null;
  if (resolvedSourcingId === null) return result("JOURNAL_NOT_INITIALIZED", { read_only: true });
  if (document.checkpoint) {
    try { validateCheckpoint(document.checkpoint, { sourcing_id: resolvedSourcingId }); }
    catch (error) { return result("CHECKPOINT_CORRUPTION", { error_code: errorCode(error), message: error.message, read_only: true }); }
  }
  let state;
  try {
    state = reduceEvents(document.events, { sourcing_id: resolvedSourcingId });
  } catch (error) {
    return result(classifyError(error), { error_code: errorCode(error), message: error.message, event_count: document.events.length, read_only: true });
  }
  for (const event of document.events) {
    try { await validateStoredEventArtifacts(root, event); }
    catch (error) {
      const outcome = classifyError(error);
      return result(outcome, { error_code: errorCode(error), message: error.message, event_id: event.event_id, event_count: document.events.length, read_only: true });
    }
  }
  if (document.tail) {
    if (document.checkpoint && checkpointMatchesPrefix(document.checkpoint, document.events, state)) {
      return result("RECOVERABLE_TORN_TAIL", {
        sourcing_id: resolvedSourcingId,
        valid_event_count: document.events.length,
        tail: document.tail,
        state_digest: state.state_digest,
        read_only: true,
      });
    }
    return result("CHAIN_CORRUPTION", { error_code: "UNCOMMITTED_TAIL_NOT_PROVEN", message: "final journal tail exists without a checkpoint proving it is uncommitted", read_only: true });
  }
  if (!document.checkpoint) {
    return result("VALID_INTERNAL_CHAIN_NO_EXTERNAL_COMPLETENESS_PROOF", {
      sourcing_id: resolvedSourcingId,
      event_count: document.events.length,
      head_event_digest: state.journal.head_event_digest,
      state_digest: state.state_digest,
      read_only: true,
    });
  }
  const checkpoint = document.checkpoint;
  if (checkpoint.expected_event_count > document.events.length) {
    return result("JOURNAL_BEHIND_CHECKPOINT", {
      sourcing_id: resolvedSourcingId,
      event_count: document.events.length,
      checkpoint_event_count: checkpoint.expected_event_count,
      expected_head_event_digest: checkpoint.expected_head_event_digest,
      actual_head_event_digest: state.journal.head_event_digest,
      read_only: true,
    });
  }
  if (checkpoint.expected_event_count < document.events.length) {
    let prefix;
    try { prefix = reduceEvents(document.events.slice(0, checkpoint.expected_event_count), { sourcing_id: resolvedSourcingId }); }
    catch (error) { return result("CHAIN_CORRUPTION", { error_code: errorCode(error), message: error.message, read_only: true }); }
    if (checkpointMatchesPrefix(checkpoint, document.events, prefix)) {
      return result("CHECKPOINT_LAG", {
        sourcing_id: resolvedSourcingId,
        checkpoint_event_count: checkpoint.expected_event_count,
        event_count: document.events.length,
        checkpoint_head_event_digest: checkpoint.expected_head_event_digest,
        journal_head_event_digest: state.journal.head_event_digest,
        state_digest: state.state_digest,
        read_only: true,
      });
    }
    return result("JOURNAL_BEHIND_CHECKPOINT", { message: "checkpoint does not match any valid journal prefix", read_only: true });
  }
  if (checkpoint.expected_head_event_digest !== state.journal.head_event_digest || checkpoint.expected_state_digest !== state.state_digest) {
    return result("STATE_REPLAY_MISMATCH", {
      sourcing_id: resolvedSourcingId,
      event_count: document.events.length,
      checkpoint_head_event_digest: checkpoint.expected_head_event_digest,
      replay_head_event_digest: state.journal.head_event_digest,
      checkpoint_state_digest: checkpoint.expected_state_digest,
      replay_state_digest: state.state_digest,
      read_only: true,
    });
  }
  return result("VALID_CURRENT_HEAD", {
    sourcing_id: resolvedSourcingId,
    event_count: document.events.length,
    head_event_digest: state.journal.head_event_digest,
    state_digest: state.state_digest,
    checkpoint_generation: checkpoint.generation,
    read_only: true,
  });
}

export async function verifyEventsOnly(events, { sourcing_id = null } = {}) {
  try {
    for (const event of events) validateEventEnvelope(event, { expected_sourcing_id: sourcing_id });
    const state = reduceEvents(events, { sourcing_id });
    return result("VALID_INTERNAL_CHAIN_NO_EXTERNAL_COMPLETENESS_PROOF", { event_count: events.length, state_digest: state.state_digest, read_only: true });
  } catch (error) {
    return result(classifyError(error), { error_code: errorCode(error), message: error.message, read_only: true });
  }
}

export const r6VerifierContract = Object.freeze({
  mutation: "none",
  inputs: ["events.jsonl", "journal.head.json", "content-addressed artifacts", "R6 code"],
  valid_prefix_without_checkpoint: "VALID_INTERNAL_CHAIN_NO_EXTERNAL_COMPLETENESS_PROOF",
  checkpoint_lag: "CHECKPOINT_LAG",
  checkpoint_ahead: "JOURNAL_BEHIND_CHECKPOINT",
  tail_repair: "separate explicit repairTornTail operation; verifier never repairs",
});
