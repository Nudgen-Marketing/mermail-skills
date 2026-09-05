import {
  compileCommonPacket, compileSupplierPacket, openFinalRound, verifyCommonCoreEquality,
} from "../authority/manifest-round-compiler.mjs";
import { clone, fail, freeze, utc } from "./core.mjs";
import { validateOffer } from "./schema.mjs";

export function compileR7FinalRound({ frozenManifest, initialClosedState, opened_at, policy }) {
  if (policy.sourcing_id !== frozenManifest.manifest.sourcing_id || policy.manifest_digest !== frozenManifest.manifest_digest) fail("POLICY_MANIFEST_MISMATCH", "R7 policy is not bound to the R3 frozen manifest");
  const finalState = openFinalRound(initialClosedState, frozenManifest, {
    opened_at,
    origin: { kind: "BUYER_CONTROL", reference: frozenManifest.manifest.buyer_authority_ref },
  });
  if (finalState.deadline_policy.final_cutoff_at !== policy.final_revision_policy.cutoff_at || finalState.deadline_policy.cutoff_inclusive !== policy.final_revision_policy.cutoff_inclusive) fail("FINAL_CUTOFF_BINDING", "R7 final cutoff policy drifted from R3 final state");
  const common = compileCommonPacket(frozenManifest, finalState);
  const packets = finalState.eligibility.eligible_supplier_ids.map((supplierId) => compileSupplierPacket(frozenManifest, finalState, supplierId));
  const equality = verifyCommonCoreEquality(packets, frozenManifest, finalState);
  if (!equality.equal) fail("COMMON_PACKET_INEQUALITY", "R3 common-core equality failed", equality);
  return freeze({ final_state: finalState, common_packet: common, supplier_packets: packets, equality });
}

export function classifyFinalSubmission({ submission, finalRound, policy, initialOfferDigest = null }) {
  try { validateOffer(submission, policy); } catch (error) { return { status: "REJECTED", reason: error.code ?? "INVALID_SUBMISSION", supplier_id: submission?.supplier_id ?? null }; }
  if (submission.sourcing_id !== finalRound.final_state.sourcing_id) return { status: "INELIGIBLE", reason: "FINAL_SOURCING_MISMATCH", supplier_id: submission.supplier_id };
  if (submission.revision_kind !== "FINAL") return { status: "REJECTED", reason: "NOT_FINAL_REVISION" };
  if (initialOfferDigest !== null && submission.predecessor_offer_digest !== initialOfferDigest) return { status: "REJECTED", reason: "PREDECESSOR_OFFER_MISMATCH", supplier_id: submission.supplier_id };
  if (submission.round_id !== finalRound.final_state.round_id || submission.manifest_digest !== finalRound.final_state.manifest_digest || submission.manifest_revision !== finalRound.final_state.manifest_revision) return { status: "INELIGIBLE", reason: "FINAL_ANCESTRY_MISMATCH", supplier_id: submission.supplier_id };
  if (!finalRound.final_state.eligibility.eligible_supplier_ids.includes(submission.supplier_id)) return { status: "INELIGIBLE", reason: "SUPPLIER_NOT_FROZEN_ELIGIBLE", supplier_id: submission.supplier_id };
  const cutoff = Date.parse(policy.final_revision_policy.cutoff_at);
  const received = Date.parse(submission.received_at);
  const onTime = policy.final_revision_policy.cutoff_inclusive ? received <= cutoff : received < cutoff;
  return Object.freeze({ status: onTime ? "ACCEPTED_ON_TIME" : "LATE_PRESERVED", reason: onTime ? "BEFORE_FINAL_CUTOFF" : "AT_OR_AFTER_EXCLUSIVE_FINAL_CUTOFF", supplier_id: submission.supplier_id, offer_digest: submission.offer_digest, received_at: submission.received_at });
}

export function selectEffectiveRevisions({ initialOffers, finalSubmissions, finalRound, policy }) {
  const effective = [];
  const classifications = [];
  const conflictedSupplierIds = [];
  for (const initial of initialOffers) {
    validateOffer(initial, policy);
    let chosen = initial;
    const accepted = [];
    for (const submission of finalSubmissions.filter((candidate) => candidate.supplier_id === initial.supplier_id)) {
      const classification = classifyFinalSubmission({ submission, finalRound, policy, initialOfferDigest: initial.offer_digest });
      classifications.push(classification);
      if (classification.status === "ACCEPTED_ON_TIME") accepted.push(submission);
    }
    if (accepted.length === 1) effective.push(accepted[0]);
    else if (accepted.length > 1) {
      classifications.push({ status: "CONFLICT", reason: "MULTIPLE_ON_TIME_FINAL_REVISIONS", supplier_id: initial.supplier_id });
      conflictedSupplierIds.push(initial.supplier_id);
    } else effective.push(chosen);
  }
  effective.sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
  return freeze({ effective_offers: effective, conflicted_supplier_ids: conflictedSupplierIds.sort(), classifications, late_policy: "preserve_as_late", no_valid_final_behavior: "INITIAL_REMAINS_EFFECTIVE", conflict_behavior: "NO_EFFECTIVE_OFFER_UNTIL_BUYER_RESOLUTION" });
}

export function finalRoundLineage(finalRound) {
  return {
    round_id: finalRound.final_state.round_id,
    predecessor_round_id: finalRound.final_state.predecessor.round_id,
    predecessor_state_digest: finalRound.final_state.predecessor.state_digest,
    manifest_revision: finalRound.final_state.manifest_revision,
    manifest_digest: finalRound.final_state.manifest_digest,
    eligibility_digest: finalRound.final_state.eligibility.eligibility_digest,
    eligible_supplier_ids: clone(finalRound.final_state.eligibility.eligible_supplier_ids),
    final_cutoff_at: finalRound.final_state.deadline_policy.final_cutoff_at,
    cutoff_inclusive: finalRound.final_state.deadline_policy.cutoff_inclusive,
  };
}
