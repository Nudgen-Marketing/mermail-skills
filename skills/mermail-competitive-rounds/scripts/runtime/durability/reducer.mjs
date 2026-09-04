import { canonicalize, cloneJson, sha256Canonical } from "./canonical.mjs";
import { eventRule, genesisDigest, validateEventEnvelope } from "./event-schema.mjs";
import { fail } from "./errors.mjs";

function digestlessState(state) {
  const copy = cloneJson(state);
  delete copy.state_digest;
  return copy;
}

function finalizeState(state) {
  const result = cloneJson(state);
  result.state_digest = sha256Canonical(digestlessState(result));
  return result;
}

export function stateDigest(state) {
  return sha256Canonical(digestlessState(state));
}

export function createEmptyState(sourcing_id) {
  if (typeof sourcing_id !== "string" || sourcing_id.length < 1) fail("INVALID_SOURCING_ID", "sourcing_id is required");
  return finalizeState({
    state_schema_version: "r6.state.v1",
    sourcing_id,
    active_manifest: null,
    manifest_history: [],
    rounds: [],
    eligibility: [],
    sources: [],
    evidence: [],
    field_states: [],
    lane_packets: [],
    lane_results: [],
    journal: { event_count: 0, head_event_digest: genesisDigest(sourcing_id) },
  });
}

function eventRef(event, index = 0) {
  return event.artifact_refs[index]?.digest ?? null;
}

function requireManifest(state, event) {
  if (!state.active_manifest) fail("MANIFEST_REQUIRED", `${event.event_type} requires a frozen manifest`);
  if (event.payload.manifest_digest !== state.active_manifest.manifest_digest || event.payload.manifest_revision !== state.active_manifest.manifest_revision) fail("MANIFEST_ANCESTRY_MISMATCH", "event does not belong to the active manifest");
}

function findRound(state, roundId) {
  return state.rounds.find((round) => round.round_id === roundId) ?? null;
}

function requireRound(state, roundId) {
  const round = findRound(state, roundId);
  if (!round) fail("ROUND_NOT_FOUND", `round ${roundId} is not in replayed state`);
  return round;
}

function replaceAt(array, predicate, value) {
  return array.map((item) => predicate(item) ? value : item);
}

function applyEvent(state, event) {
  const next = cloneJson(state);
  const payload = event.payload;
  const artifactDigest = eventRef(event);
  switch (event.event_type) {
    case "MANIFEST_FROZEN": {
      if (state.active_manifest) fail("MANIFEST_ALREADY_FROZEN", "a sourcing aggregate cannot freeze a second initial manifest");
      if (payload.manifest_revision !== 1) fail("INITIAL_MANIFEST_REVISION", "the first manifest revision must be 1");
      next.active_manifest = {
        manifest_revision: payload.manifest_revision,
        manifest_digest: payload.manifest_digest,
        manifest_identity: payload.manifest_identity,
        supplier_ids: [...payload.supplier_ids],
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      };
      next.manifest_history.push(cloneJson(next.active_manifest));
      break;
    }
    case "MANIFEST_REVISED": {
      if (!state.active_manifest) fail("MANIFEST_REQUIRED", "a revision requires a frozen manifest");
      if (state.rounds.length > 0) fail("MANIFEST_REVISION_AFTER_ROUND_OPEN", "protected manifest policy forbids revision after a round exists");
      if (payload.predecessor_manifest_digest !== state.active_manifest.manifest_digest) fail("MANIFEST_REVISION_ANCESTRY", "revision predecessor does not match the active manifest");
      if (payload.manifest_revision !== state.active_manifest.manifest_revision + 1) fail("MANIFEST_REVISION_SEQUENCE", "manifest revision must increase by exactly one");
      next.active_manifest = {
        manifest_revision: payload.manifest_revision,
        manifest_digest: payload.manifest_digest,
        manifest_identity: payload.manifest_identity,
        supplier_ids: [...payload.supplier_ids],
        artifact_digest: artifactDigest,
        event_id: event.event_id,
        predecessor_manifest_digest: payload.predecessor_manifest_digest,
      };
      next.manifest_history.push(cloneJson(next.active_manifest));
      break;
    }
    case "ROUND_OPENED": {
      requireManifest(state, { payload, event_type: event.event_type });
      if (findRound(state, payload.round_id)) fail("ROUND_ID_REUSE", `round ${payload.round_id} already exists`);
      const finalRound = payload.round_type === "FINAL_REVISION";
      if (finalRound) {
        if (!payload.predecessor_round_id) fail("FINAL_PREDECESSOR_REQUIRED", "a final round must name its predecessor");
        const predecessor = requireRound(state, payload.predecessor_round_id);
        if (predecessor.status !== "CLOSED") fail("FINAL_PREDECESSOR_NOT_CLOSED", "final round requires a closed predecessor");
        const eligible = state.eligibility.find((item) => item.round_id === predecessor.round_id);
        if (!eligible) fail("FINAL_ELIGIBILITY_REQUIRED", "final round requires frozen eligibility");
        if (payload.supplier_ids.some((id) => !eligible.eligible_supplier_ids.includes(id))) fail("FINAL_SUPPLIER_NOT_ELIGIBLE", "final round contains a supplier outside frozen eligibility");
      } else if (payload.predecessor_round_id !== null) {
        fail("INITIAL_PREDECESSOR_FORBIDDEN", "an initial round cannot have a predecessor");
      }
      next.rounds.push({
        round_id: payload.round_id,
        round_type: payload.round_type,
        status: payload.status,
        manifest_revision: payload.manifest_revision,
        manifest_digest: payload.manifest_digest,
        supplier_ids: [...payload.supplier_ids],
        predecessor_round_id: payload.predecessor_round_id,
        state_artifact_digest: artifactDigest,
        state_digest: null,
        opened_event_id: event.event_id,
        closed_event_id: null,
      });
      break;
    }
    case "ROUND_CLOSED": {
      requireManifest(state, event);
      const round = requireRound(state, payload.round_id);
      if (!["OPEN", "FINAL_REVISION_OPEN"].includes(round.status)) fail("INVALID_ROUND_CLOSE", "only an open round can close");
      if (round.round_type !== payload.round_type || round.manifest_digest !== payload.manifest_digest || round.manifest_revision !== payload.manifest_revision) fail("ROUND_ANCESTRY_MISMATCH", "closed round ancestry does not match the open round");
      next.rounds = replaceAt(next.rounds, (candidate) => candidate.round_id === round.round_id, {
        ...round,
        status: payload.status,
        state_artifact_digest: artifactDigest,
        state_digest: payload.state_digest,
        closed_event_id: event.event_id,
      });
      break;
    }
    case "ELIGIBILITY_FROZEN": {
      const round = requireRound(state, payload.round_id);
      if (round.round_type !== "INITIAL" || round.status !== "CLOSED") fail("ELIGIBILITY_PRECONDITION", "eligibility freezes only after an initial close");
      if (state.eligibility.some((item) => item.round_id === payload.round_id)) fail("ELIGIBILITY_ALREADY_FROZEN", "eligibility is append-only and already frozen");
      if (payload.eligible_supplier_ids.some((id) => !round.supplier_ids.includes(id))) fail("ELIGIBILITY_ROSTER_MISMATCH", "eligibility contains a supplier outside the closed round");
      next.eligibility.push({
        round_id: payload.round_id,
        state_digest: payload.state_digest,
        eligibility_digest: payload.eligibility_digest,
        eligible_supplier_ids: [...payload.eligible_supplier_ids],
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      });
      break;
    }
    case "SOURCE_OBSERVED": {
      const round = requireRound(state, payload.round_id);
      if (!["OPEN", "FINAL_REVISION_OPEN"].includes(round.status)) fail("SOURCE_ROUND_NOT_OPEN", "source observations require an open round");
      if (!round.supplier_ids.includes(payload.supplier_id)) fail("SOURCE_SUPPLIER_NOT_IN_ROUND", "source supplier is not in the round");
      if (state.sources.some((source) => source.source_snapshot_digest === payload.source_snapshot_digest)) fail("SOURCE_ALREADY_OBSERVED", "the exact source snapshot is already recorded");
      next.sources.push({
        round_id: payload.round_id,
        supplier_id: payload.supplier_id,
        source_snapshot_digest: payload.source_snapshot_digest,
        mailbox_id: payload.mailbox_id,
        email_id: payload.email_id,
        content_state: payload.content_state,
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      });
      break;
    }
    case "EVIDENCE_STATE_RECORDED": {
      const round = requireRound(state, payload.round_id);
      if (!round.supplier_ids.includes(payload.supplier_id)) fail("EVIDENCE_SUPPLIER_NOT_IN_ROUND", "evidence supplier is not in the round");
      const source = state.sources.find((candidate) => candidate.source_snapshot_digest === payload.source_snapshot_digest && candidate.round_id === payload.round_id && candidate.supplier_id === payload.supplier_id);
      if (!source) fail("EVIDENCE_SOURCE_NOT_RECORDED", "evidence must reference a source already in the journal");
      if (state.evidence.some((item) => item.evidence_id === payload.evidence_id)) fail("EVIDENCE_ID_REUSE", "evidence ID is already recorded");
      const item = {
        round_id: payload.round_id,
        supplier_id: payload.supplier_id,
        evidence_id: payload.evidence_id,
        source_snapshot_digest: payload.source_snapshot_digest,
        field_name: payload.field_name,
        verification_state: payload.verification_state,
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      };
      next.evidence.push(item);
      next.field_states.push({ ...item });
      break;
    }
    case "LANE_PACKET_COMPILED": {
      const round = requireRound(state, payload.round_id);
      if (!round.supplier_ids.includes(payload.supplier_id)) fail("PACKET_SUPPLIER_NOT_IN_ROUND", "lane packet supplier is not in the round");
      const evidence = state.evidence.find((item) => item.evidence_id === payload.evidence_id && item.supplier_id === payload.supplier_id && item.round_id === payload.round_id);
      if (!evidence) fail("PACKET_EVIDENCE_NOT_RECORDED", "lane packet must reference recorded evidence");
      if (evidence.verification_state !== "VERIFIED") fail("PACKET_EVIDENCE_NOT_VERIFIED", "lane packet requires a verified evidence record");
      if (state.lane_packets.some((item) => item.packet_digest === payload.packet_digest)) fail("PACKET_ALREADY_RECORDED", "lane packet digest is already recorded");
      next.lane_packets.push({
        round_id: payload.round_id,
        supplier_id: payload.supplier_id,
        lane_id: payload.lane_id,
        packet_digest: payload.packet_digest,
        evidence_id: payload.evidence_id,
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      });
      break;
    }
    case "LANE_RESULT_DECLASSIFIED": {
      const packet = state.lane_packets.find((item) => item.packet_digest === payload.packet_digest && item.round_id === payload.round_id && item.supplier_id === payload.supplier_id);
      if (!packet) fail("RESULT_PACKET_NOT_RECORDED", "declassified result must reference a recorded lane packet");
      if (packet.lane_id !== payload.lane_id) fail("RESULT_LANE_MISMATCH", "declassified result lane does not match compiled packet");
      if (state.lane_results.some((item) => item.packet_digest === payload.packet_digest)) fail("RESULT_ALREADY_RECORDED", "lane result is already recorded");
      next.lane_results.push({
        round_id: payload.round_id,
        supplier_id: payload.supplier_id,
        lane_id: payload.lane_id,
        packet_digest: payload.packet_digest,
        declassification_digest: payload.declassification_digest,
        artifact_digest: artifactDigest,
        event_id: event.event_id,
      });
      break;
    }
    default:
      fail("UNKNOWN_EVENT_TYPE", `cannot reduce unknown event ${event.event_type}`);
  }
  return next;
}

export function reduceEvents(events, { sourcing_id = null } = {}) {
  if (!Array.isArray(events)) fail("INVALID_EVENT_LIST", "events must be an array");
  let state;
  if (events.length === 0) {
    if (sourcing_id === null) fail("SOURCING_ID_REQUIRED", "an empty journal needs an explicit sourcing_id");
    return createEmptyState(sourcing_id);
  }
  const firstSourcingId = sourcing_id ?? events[0].sourcing_id;
  state = createEmptyState(firstSourcingId);
  const seenCommands = new Set();
  for (const [index, event] of events.entries()) {
    validateEventEnvelope(event, { expected_sourcing_id: firstSourcingId });
    if (event.sequence !== index + 1) fail("SEQUENCE_ERROR", "event sequence must be exactly contiguous", { expected: index + 1, actual: event.sequence });
    const expectedPrevious = index === 0 ? genesisDigest(firstSourcingId) : events[index - 1].event_digest;
    if (event.previous_event_digest !== expectedPrevious) fail("CHAIN_LINK_MISMATCH", "event previous digest does not link to the prior event");
    if (seenCommands.has(event.command_id)) fail("DUPLICATE_COMMAND_ID", "one command ID may commit at most one event");
    seenCommands.add(event.command_id);
    state = applyEvent(state, event);
    state.journal = { event_count: index + 1, head_event_digest: event.event_digest };
    state = finalizeState(state);
  }
  return state;
}

export function inspectState(state) {
  if (!state || typeof state !== "object") fail("INVALID_STATE", "state must be an object");
  return Object.freeze({
    sourcing_id: state.sourcing_id,
    manifest_revision: state.active_manifest?.manifest_revision ?? null,
    manifest_digest: state.active_manifest?.manifest_digest ?? null,
    round_ids: state.rounds.map((round) => round.round_id),
    round_statuses: state.rounds.map((round) => ({ round_id: round.round_id, status: round.status })),
    source_count: state.sources.length,
    evidence_count: state.evidence.length,
    lane_packet_count: state.lane_packets.length,
    lane_result_count: state.lane_results.length,
    journal: cloneJson(state.journal),
    state_digest: state.state_digest,
  });
}

export const r6ReducerContract = Object.freeze({
  state_schema_version: "r6.state.v1",
  authoritative_input: "validated event sequence only",
  forbidden_inputs: ["filesystem", "network", "Mermail", "model", "caller_state_snapshot"],
  event_registry: Object.freeze(Object.fromEntries(["MANIFEST_FROZEN", "MANIFEST_REVISED", "ROUND_OPENED", "ROUND_CLOSED", "ELIGIBILITY_FROZEN", "SOURCE_OBSERVED", "EVIDENCE_STATE_RECORDED", "LANE_PACKET_COMPILED", "LANE_RESULT_DECLASSIFIED"].map((type) => [type, eventRule(type)]))),
});
