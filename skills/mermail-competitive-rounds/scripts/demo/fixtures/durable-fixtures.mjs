import {
  AUTHORITY,
  closeInitialRound,
  createManifestRevision,
  openFinalRound,
} from "../../runtime/authority/manifest-round-compiler.mjs";
import { makeApproval, makeManifest, makeStubObservation } from "./manifest-fixtures.mjs";
import {
  OBSERVATION_ROLES,
  createRecipientObservation,
  makeRecipientClaimProposal,
  verifyRecipientClaim,
} from "../../runtime/evidence/recipient-evidence.mjs";
import { declassifyWorkerOutput } from "../../runtime/worker/declassifier.mjs";
import { FIELD_SCHEMA, buildR5Fixture, proposalFor, rawProposal } from "./lane-fixtures.mjs";
import { putJsonArtifact, putArtifact } from "../../runtime/durability/artifact-store.mjs";
import { sha256Bytes } from "../../runtime/durability/canonical.mjs";

export function buildR6Scenario() {
  const r5 = buildR5Fixture();
  const supplierId = "supplier-a";
  const snapshot = r5.snapshots[supplierId];
  const observation = createRecipientObservation({ source_snapshot: snapshot, observation_role: OBSERVATION_ROLES.BUYER_RECEIVED });
  const proposal = makeRecipientClaimProposal({
    snapshot,
    field_name: "delivery_days",
    fragment: "5 days",
    proposed_value: { days: 5 },
    proposed_unit: "day",
    supplier_id: supplierId,
    sourcing_id: r5.manifest.sourcing_id,
    round_id: r5.round.round_id,
  });
  const evidence = verifyRecipientClaim({
    observation,
    supplier_context: r5.contexts[supplierId],
    raw_proposal: proposal,
    buyer_mailbox_id: snapshot.mailbox_id,
  });
  const workerProposal = proposalFor(r5.packets[supplierId], { field_name: "delivery_days", value: { days: 5 } });
  const declassified = declassifyWorkerOutput({ packet: r5.packets[supplierId], raw_worker_output: rawProposal(workerProposal) });
  const closed = closeInitialRound(r5.round, {
    closed_at: "2026-09-10T18:00:00Z",
    observations: [
      makeStubObservation("supplier-a", "RESPONDED", "2026-09-09T10:00:00Z"),
      makeStubObservation("supplier-b", "RESPONDED", "2026-09-10T16:00:00Z"),
      makeStubObservation("supplier-c", "RESPONDED", "2026-09-10T16:30:00Z"),
    ],
    origin: { kind: AUTHORITY.SYSTEM_DERIVED, reference: "r6-fixture-clock" },
  });
  const final = openFinalRound(closed, r5.frozen, {
    opened_at: "2026-09-10T19:00:00Z",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: r5.manifest.buyer_authority_ref },
  });
  return Object.freeze({
    ...r5,
    evidence,
    observation,
    proposal,
    declassified,
    closed,
    final,
    field_schema: FIELD_SCHEMA,
  });
}

export async function materializeScenarioArtifacts(root, scenario = buildR6Scenario()) {
  const values = {
    manifest: ["R3_FROZEN_MANIFEST", scenario.frozen],
    round_open: ["R3_ROUND_STATE", scenario.round],
    round_closed: ["R3_ROUND_STATE", scenario.closed],
    round_final_open: ["R3_ROUND_STATE", scenario.final],
    source: ["R4_SOURCE_SNAPSHOT", scenario.snapshots["supplier-a"]],
    evidence: ["R4R_EVIDENCE_RECORD", scenario.evidence],
    lane_packet: ["R5_LANE_PACKET", scenario.packets["supplier-a"]],
    lane_result: ["R5_DECLASSIFIED_RESULT", scenario.declassified],
  };
  const refs = {};
  for (const [name, [artifact_type, value]] of Object.entries(values)) {
    const result = await putJsonArtifact(root, value);
    refs[name] = { digest: result.digest, artifact_type };
  }
  const raw = Buffer.from("raw untrusted worker output; not reducer authority", "utf8");
  const rawResult = await putArtifact(root, raw);
  refs.raw_worker = { digest: rawResult.digest, artifact_type: "R5_RAW_WORKER_OUTPUT" };
  return Object.freeze({ scenario, refs });
}

export function command({ sourcing_id, command_id, event_type, payload, artifact_refs, expected_head_event_digest = null }) {
  return {
    command_schema_version: "r6.command.v1",
    sourcing_id,
    command_id,
    event_type,
    payload,
    artifact_refs,
    expected_head_event_digest,
  };
}

export function scenarioCommands(materialized) {
  const { scenario, refs } = materialized;
  const sourcing_id = scenario.manifest.sourcing_id;
  const manifestPayload = {
    manifest_digest: scenario.frozen.manifest_digest,
    manifest_revision: scenario.frozen.manifest.manifest_revision,
    manifest_identity: scenario.frozen.manifest_identity,
    supplier_ids: scenario.frozen.manifest.supplier_roster.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b)),
  };
  return [
    command({ sourcing_id, command_id: "cmd-manifest-001", event_type: "MANIFEST_FROZEN", payload: manifestPayload, artifact_refs: [refs.manifest] }),
    command({ sourcing_id, command_id: "cmd-round-open-001", event_type: "ROUND_OPENED", payload: {
      round_id: scenario.round.round_id,
      round_type: scenario.round.round_type,
      manifest_revision: scenario.round.manifest_revision,
      manifest_digest: scenario.round.manifest_digest,
      status: scenario.round.status,
      predecessor_round_id: null,
      supplier_ids: scenario.round.lanes.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b)),
    }, artifact_refs: [refs.round_open] }),
    command({ sourcing_id, command_id: "cmd-source-001", event_type: "SOURCE_OBSERVED", payload: {
      round_id: scenario.round.round_id,
      supplier_id: "supplier-a",
      source_snapshot_digest: scenario.snapshots["supplier-a"].source_snapshot_digest,
      mailbox_id: scenario.snapshots["supplier-a"].mailbox_id,
      email_id: scenario.snapshots["supplier-a"].email_id,
      content_state: scenario.snapshots["supplier-a"].content_state,
    }, artifact_refs: [refs.source] }),
    command({ sourcing_id, command_id: "cmd-evidence-001", event_type: "EVIDENCE_STATE_RECORDED", payload: {
      round_id: scenario.round.round_id,
      supplier_id: "supplier-a",
      evidence_id: scenario.evidence.evidence_id,
      source_snapshot_digest: scenario.evidence.receipt_snapshot_digest,
      field_name: scenario.evidence.field_name,
      verification_state: scenario.evidence.verification_state,
    }, artifact_refs: [refs.evidence] }),
    command({ sourcing_id, command_id: "cmd-packet-001", event_type: "LANE_PACKET_COMPILED", payload: {
      round_id: scenario.round.round_id,
      supplier_id: "supplier-a",
      lane_id: scenario.packets["supplier-a"].lane_id,
      packet_digest: scenario.packets["supplier-a"].packet_digest,
      evidence_id: scenario.evidence.evidence_id,
    }, artifact_refs: [refs.lane_packet] }),
    command({ sourcing_id, command_id: "cmd-result-001", event_type: "LANE_RESULT_DECLASSIFIED", payload: {
      round_id: scenario.round.round_id,
      supplier_id: "supplier-a",
      lane_id: scenario.packets["supplier-a"].lane_id,
      packet_digest: scenario.packets["supplier-a"].packet_digest,
      declassification_digest: scenario.declassified.declassification_digest,
    }, artifact_refs: [refs.lane_result] }),
    command({ sourcing_id, command_id: "cmd-round-close-001", event_type: "ROUND_CLOSED", payload: {
      round_id: scenario.closed.round_id,
      round_type: scenario.closed.round_type,
      manifest_revision: scenario.closed.manifest_revision,
      manifest_digest: scenario.closed.manifest_digest,
      status: scenario.closed.status,
      state_digest: scenario.closed.state_digest,
      supplier_ids: scenario.closed.lanes.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b)),
    }, artifact_refs: [refs.round_closed] }),
    command({ sourcing_id, command_id: "cmd-eligibility-001", event_type: "ELIGIBILITY_FROZEN", payload: {
      round_id: scenario.closed.round_id,
      state_digest: scenario.closed.state_digest,
      eligibility_digest: scenario.closed.eligibility.eligibility_digest,
      eligible_supplier_ids: [...scenario.closed.eligibility.eligible_supplier_ids].sort((a, b) => a.localeCompare(b)),
    }, artifact_refs: [refs.round_closed] }),
    command({ sourcing_id, command_id: "cmd-final-open-001", event_type: "ROUND_OPENED", payload: {
      round_id: scenario.final.round_id,
      round_type: scenario.final.round_type,
      manifest_revision: scenario.final.manifest_revision,
      manifest_digest: scenario.final.manifest_digest,
      status: scenario.final.status,
      predecessor_round_id: scenario.final.predecessor.round_id,
      supplier_ids: scenario.final.lanes.map((item) => item.supplier_id).sort((a, b) => a.localeCompare(b)),
    }, artifact_refs: [refs.round_final_open] }),
  ];
}

export function revisionArtifact(scenario) {
  const nextManifest = makeManifest({
    manifest_revision: 2,
    supplier_roster: scenario.manifest.supplier_roster,
    deadline_policy: { initial_cutoff_at: "2026-09-11T17:00:00Z" },
  });
  const approval = makeApproval(nextManifest, "amend_manifest", {
    predecessor_manifest_digest: scenario.frozen.manifest_digest,
    changed_fields: ["/deadline_policy/initial_cutoff_at"],
  });
  return createManifestRevision(scenario.frozen, nextManifest, approval);
}
