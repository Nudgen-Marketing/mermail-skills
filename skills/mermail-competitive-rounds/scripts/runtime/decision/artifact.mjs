import { sha256Canonical } from "../authority/manifest-round-compiler.mjs";
import { R7_ARTIFACT_VERSION, clone, digest, exactKeys, fail, freeze, requiredKeys } from "./core.mjs";
import { assertDecisionSafe, evaluateRound } from "./evaluator.mjs";
import { validateOffer, validatePolicy, validateEvidenceRecord } from "./schema.mjs";

const KEYS = ["artifact_schema_version", "sourcing_id", "r6_state_digest", "r6_head_event_digest", "round_state_digest", "evaluator_version", "policy_digest", "eligible_supplier_ids", "offer_digests", "evidence_digests", "decision", "result_digest"];
export const CURRENT_EVALUATOR_VERSION = "r7.evaluator.v1";

export function buildEvaluationArtifact({ r6_state_digest, r6_head_event_digest, round_state_digest, policy, eligibleSupplierIds, offers, evidenceRecords, decision }) {
  validatePolicy(policy);
  for (const offer of offers) validateOffer(offer, policy);
  for (const record of evidenceRecords) validateEvidenceRecord(record);
  assertDecisionSafe(decision);
  digest(r6_state_digest, "r6_state_digest");
  digest(r6_head_event_digest, "r6_head_event_digest");
  digest(round_state_digest, "round_state_digest");
  const artifact = {
    artifact_schema_version: R7_ARTIFACT_VERSION,
    sourcing_id: policy.sourcing_id,
    r6_state_digest,
    r6_head_event_digest,
    round_state_digest,
    evaluator_version: CURRENT_EVALUATOR_VERSION,
    policy_digest: sha256Canonical(policy),
    eligible_supplier_ids: [...eligibleSupplierIds].sort(),
    offer_digests: offers.map((offer) => offer.offer_digest).sort(),
    evidence_digests: evidenceRecords.map((record) => record.record_digest).sort(),
    decision: clone(decision),
    result_digest: null,
  };
  artifact.result_digest = sha256Canonical(artifact);
  return freeze(artifact);
}

export function verifyEvaluationArtifact(artifact, { policy, eligibleSupplierIds, offers, evidenceRecords, r6_state_digest, r6_head_event_digest, round_state_digest }) {
  try {
    exactKeys(artifact, KEYS, "evaluation_artifact");
    requiredKeys(artifact, KEYS, "evaluation_artifact");
    if (artifact.artifact_schema_version !== R7_ARTIFACT_VERSION) fail("ARTIFACT_VERSION", "unsupported R7 evaluation artifact");
    if (artifact.sourcing_id !== policy.sourcing_id || artifact.r6_state_digest !== r6_state_digest || artifact.r6_head_event_digest !== r6_head_event_digest || artifact.round_state_digest !== round_state_digest) fail("ARTIFACT_BINDING", "evaluation artifact is not bound to expected durable state");
    if (artifact.evaluator_version !== CURRENT_EVALUATOR_VERSION) fail("EVALUATOR_VERSION", "evaluation artifact uses an unsupported evaluator version");
    if (artifact.policy_digest !== sha256Canonical(policy)) fail("POLICY_DIGEST", "evaluation policy digest mismatch");
    if (JSON.stringify(artifact.eligible_supplier_ids) !== JSON.stringify([...eligibleSupplierIds].sort())) fail("ELIGIBILITY_INPUTS", "eligible supplier set mismatch");
    if (artifact.result_digest !== sha256Canonical({ ...artifact, result_digest: null })) fail("RESULT_DIGEST", "evaluation result digest mismatch");
    const expectedOfferDigests = offers.map((offer) => offer.offer_digest).sort();
    const expectedEvidenceDigests = evidenceRecords.map((record) => record.record_digest).sort();
    if (JSON.stringify(artifact.offer_digests) !== JSON.stringify(expectedOfferDigests)) fail("OFFER_INPUTS", "offer input digest set mismatch");
    if (JSON.stringify(artifact.evidence_digests) !== JSON.stringify(expectedEvidenceDigests)) fail("EVIDENCE_INPUTS", "evidence input digest set mismatch");
    const replay = evaluateRound({ policy, offers, evidenceRecords, eligibleSupplierIds, roundId: artifact.decision.round_id });
    if (JSON.stringify(replay) !== JSON.stringify(artifact.decision)) fail("DECISION_REPLAY", "evaluation decision does not replay from bound inputs");
    return Object.freeze({ valid: true, read_only: true, result_digest: artifact.result_digest });
  } catch (error) {
    return Object.freeze({ valid: false, read_only: true, code: error.code ?? "ARTIFACT_INVALID", message: error.message });
  }
}

export { KEYS as EVALUATION_ARTIFACT_KEYS };
