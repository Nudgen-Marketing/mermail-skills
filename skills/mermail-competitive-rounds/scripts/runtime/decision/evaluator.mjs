import { canonicalize, sha256Canonical } from "../authority/manifest-round-compiler.mjs";
import {
  DIRECTIONS, EVIDENCE_STATES, R7_VERSION, clone, compareValues, fail, freeze, typedValue,
} from "./core.mjs";
import { validateEvidenceBinding, validateEvidenceRecord, validateOffer, validatePolicy } from "./schema.mjs";

export const OUTCOMES = Object.freeze([
  "INELIGIBLE", "HARD_CONSTRAINT_FAIL", "INSUFFICIENT_EVIDENCE", "PARETO_FRONTIER", "RECOMMEND", "HUMAN_REVIEW", "NO_DEAL",
]);

function resultError(code, message, details = {}) {
  return { status: "ERROR", code, message, ...details };
}

function constraintPass(field, actual, constraint) {
  const comparison = compareValues(field, actual, constraint.value);
  if (comparison === null) return { state: "UNKNOWN", reason: "not_comparable" };
  if (constraint.operator === "LTE") return { state: comparison <= 0 ? "PASS" : "FAIL" };
  if (constraint.operator === "GTE") return { state: comparison >= 0 ? "PASS" : "FAIL" };
  if (constraint.operator === "EQ") return { state: comparison === 0 ? "PASS" : "FAIL" };
  return { state: "UNKNOWN", reason: "unsupported_operator" };
}

function evidenceMap(evidenceRecords) {
  const map = new Map();
  for (const record of evidenceRecords ?? []) {
    validateEvidenceRecord(record);
    if (map.has(record.record_digest)) throw new Error(`duplicate evidence digest ${record.record_digest}`);
    map.set(record.record_digest, record);
  }
  return map;
}

function fieldDisposition(offer, field, records) {
  const supplied = offer.fields[field.field_id];
  if (!supplied) return { field_id: field.field_id, status: "UNKNOWN", reason: "required_field_omitted" };
  if (supplied.status !== "VERIFIED") return { field_id: field.field_id, status: supplied.status, reason: `field_status_${supplied.status}` };
  const record = records.get(supplied.evidence_ref?.record_digest);
  if (!record) return { field_id: field.field_id, status: "UNKNOWN", reason: "authoritative_evidence_not_found" };
  const binding = validateEvidenceBinding(record, offer, field);
  if (!binding.ok) return { field_id: field.field_id, status: "UNKNOWN", reason: `evidence_binding_${binding.reason}` };
  return { field_id: field.field_id, status: "VERIFIED", value: clone(supplied.value), unit: supplied.unit, currency: supplied.currency, evidence_ref: clone(supplied.evidence_ref) };
}

export function evaluateHardConstraints({ policy, offer, records }) {
  const fields = [];
  const constraints = [];
  for (const field of policy.field_schema) {
    const disposition = fieldDisposition(offer, field, records);
    fields.push(disposition);
    if (field.required && disposition.status !== "VERIFIED") return { state: disposition.status === "CONFLICT" ? "CONFLICT" : "UNKNOWN", fields, constraints, reason: `field_${disposition.status.toLowerCase()}_${field.field_id}` };
    for (const constraint of policy.hard_constraints.filter((candidate) => candidate.field_id === field.field_id)) {
      if (disposition.status !== "VERIFIED") continue;
      const check = constraintPass(field, disposition.value, constraint);
      constraints.push({ field_id: field.field_id, operator: constraint.operator, result: check.state, value: clone(disposition.value), threshold: clone(constraint.value) });
      if (check.state === "FAIL") return { state: "FAIL", fields, constraints, reason: `hard_constraint_${field.field_id}_${constraint.operator}` };
      if (check.state !== "PASS") return { state: "UNKNOWN", fields, constraints, reason: `hard_constraint_unknown_${field.field_id}` };
    }
  }
  return { state: "PASS", fields, constraints, reason: null };
}

export function deriveComparableVector(policy, disposition) {
  const vector = {};
  for (const field of policy.field_schema) {
    if (field.direction === "NONE") continue;
    const item = disposition.fields.find((candidate) => candidate.field_id === field.field_id);
    if (!item || item.status !== "VERIFIED") return { complete: false, vector, missing_field: field.field_id };
    if (field.type === "MONEY") vector[field.field_id] = item.value.minor_units;
    else if (field.type === "INTEGER" || field.type === "DURATION") vector[field.field_id] = item.value.integer;
    else return { complete: false, vector, missing_field: field.field_id };
  }
  return { complete: true, vector };
}

export function dominates(policy, left, right) {
  let strictlyBetter = false;
  for (const field of policy.field_schema) {
    if (field.direction === "NONE") continue;
    const a = left.fields.find((candidate) => candidate.field_id === field.field_id);
    const b = right.fields.find((candidate) => candidate.field_id === field.field_id);
    if (!a || !b || a.status !== "VERIFIED" || b.status !== "VERIFIED") return false;
    const comparison = compareValues(field, a.value, b.value);
    if (comparison === null) return false;
    const oriented = field.direction === "MINIMIZE" ? comparison : -comparison;
    if (oriented > 0) return false;
    if (oriented < 0) strictlyBetter = true;
  }
  return strictlyBetter;
}

export function paretoFrontier(policy, dispositions) {
  const frontier = [];
  const relations = [];
  for (const candidate of dispositions) {
    let dominated = false;
    for (const other of dispositions) {
      if (candidate.supplier_id === other.supplier_id) continue;
      if (dominates(policy, other, candidate)) {
        dominated = true;
        relations.push({ dominator: other.supplier_id, dominated: candidate.supplier_id });
        break;
      }
    }
    if (!dominated) frontier.push(candidate);
  }
  frontier.sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
  relations.sort((a, b) => `${a.dominator}/${a.dominated}`.localeCompare(`${b.dominator}/${b.dominated}`));
  return { frontier, relations };
}

function reserveFor(policy, disposition) {
  const checks = [];
  for (const constraint of policy.reserve_policy.constraints) {
    const field = policy.field_schema.find((candidate) => candidate.field_id === constraint.field_id);
    const item = disposition.fields.find((candidate) => candidate.field_id === field.field_id);
    if (!item || item.status !== "VERIFIED") return { state: "UNKNOWN", checks, reason: `reserve_field_${field.field_id}_unknown` };
    const check = constraintPass(field, item.value, constraint);
    checks.push({ field_id: field.field_id, operator: constraint.operator, result: check.state, value: clone(item.value), threshold: clone(constraint.value) });
    if (check.state !== "PASS") return { state: check.state === "FAIL" ? "FAIL" : "UNKNOWN", checks, reason: `reserve_${field.field_id}_${check.state.toLowerCase()}` };
  }
  return { state: "PASS", checks, reason: null };
}

function dispositionFor({ policy, offer, eligibleSupplierIds, records }) {
  const base = { supplier_id: offer.supplier_id, offer_digest: offer.offer_digest, revision_kind: offer.revision_kind };
  if (!eligibleSupplierIds.includes(offer.supplier_id) || offer.eligibility_state !== "ELIGIBLE") return { ...base, status: "INELIGIBLE", reason: "supplier_not_in_frozen_eligible_set" };
  const hard = evaluateHardConstraints({ policy, offer, records });
  if (hard.state === "FAIL") return { ...base, status: "HARD_CONSTRAINT_FAIL", reason: hard.reason, fields: hard.fields, constraints: hard.constraints };
  if (hard.state === "CONFLICT") return { ...base, status: "CONFLICT", reason: hard.reason, fields: hard.fields, constraints: hard.constraints };
  if (hard.state !== "PASS") return { ...base, status: "INSUFFICIENT_EVIDENCE", reason: hard.reason, fields: hard.fields, constraints: hard.constraints };
  return { ...base, status: "FEASIBLE", reason: null, fields: hard.fields, constraints: hard.constraints };
}

function finish(policy, payload) {
  const body = {
    decision_schema_version: R7_VERSION,
    sourcing_id: policy.sourcing_id,
    manifest_revision: policy.manifest_revision,
    manifest_digest: policy.manifest_digest,
    policy_digest: sha256Canonical(policy),
    ...payload,
    result_digest: null,
  };
  body.result_digest = sha256Canonical(body);
  return freeze(body);
}

export function evaluateRound({ policy, offers, evidenceRecords = [], eligibleSupplierIds, roundId = null }) {
  validatePolicy(policy);
  if (!Array.isArray(offers) || offers.length === 0) return finish(policy, { round_id: roundId, outcome: "NO_DEAL", reason: "NO_OFFERS", supplier_dispositions: [], frontier: [], reserve: [], recommendation: null, next_action: "NO_DEAL" });
  let records;
  try {
    records = evidenceMap(evidenceRecords);
  } catch (error) {
    return finish(policy, { round_id: roundId, outcome: "HUMAN_REVIEW", reason: "INVALID_EVIDENCE_INPUT", invalid_evidence: { code: error.code ?? "INVALID_EVIDENCE" }, supplier_dispositions: [], frontier: [], reserve: [], recommendation: null, next_action: "HUMAN_REVIEW" });
  }
  const eligible = [...(eligibleSupplierIds ?? [])].sort((a, b) => a.localeCompare(b));
  const supplierIds = offers.map((offer) => offer?.supplier_id).filter((value) => typeof value === "string");
  if (new Set(supplierIds).size !== supplierIds.length) return finish(policy, { round_id: roundId, outcome: "HUMAN_REVIEW", reason: "DUPLICATE_SUPPLIER_INPUT", supplier_dispositions: [], frontier: [], reserve: [], recommendation: null, next_action: "HUMAN_REVIEW" });
  const validated = [];
  for (const offer of offers) {
    try { validateOffer(offer, policy); } catch (error) { return finish(policy, { round_id: roundId ?? offer.round_id, outcome: "HUMAN_REVIEW", reason: "INVALID_OFFER_INPUT", invalid_offer: { supplier_id: offer?.supplier_id ?? null, code: error.code ?? "INVALID_OFFER" }, supplier_dispositions: [], frontier: [], reserve: [], recommendation: null, next_action: "HUMAN_REVIEW" }); }
    if (offer.sourcing_id !== policy.sourcing_id || offer.manifest_revision !== policy.manifest_revision || offer.manifest_digest !== policy.manifest_digest || (roundId !== null && offer.round_id !== roundId)) {
      validated.push({ supplier_id: offer.supplier_id, offer_digest: offer.offer_digest, status: "INELIGIBLE", reason: "ANCESTRY_MISMATCH" });
    } else validated.push(offer);
  }
  const dispositions = validated.map((offer) => offer.status ? offer : dispositionFor({ policy, offer, eligibleSupplierIds: eligible, records })).sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
  const feasible = dispositions.filter((item) => item.status === "FEASIBLE");
  const conflict = dispositions.some((item) => item.status === "CONFLICT");
  const incomplete = dispositions.some((item) => item.status === "INSUFFICIENT_EVIDENCE");
  if (conflict) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "HUMAN_REVIEW", reason: "CONFLICTING_OR_UNTRUSTED_EVIDENCE", supplier_dispositions: dispositions, frontier: [], reserve: [], recommendation: null, next_action: "HUMAN_REVIEW" });
  if (incomplete) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "INSUFFICIENT_EVIDENCE", reason: "REQUIRED_EVIDENCE_NOT_VERIFIED", supplier_dispositions: dispositions, frontier: [], reserve: [], recommendation: null, next_action: "SUPPLY_OR_REVIEW_EVIDENCE" });
  if (feasible.length === 0) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "NO_DEAL", reason: "NO_FEASIBLE_SUPPLIER", primary_rejection: dispositions.find((item) => item.status === "HARD_CONSTRAINT_FAIL") ? "HARD_CONSTRAINT_FAIL" : "INELIGIBLE", supplier_dispositions: dispositions, frontier: [], reserve: [], recommendation: null, next_action: "NO_DEAL" });
  const { frontier, relations } = paretoFrontier(policy, feasible);
  const reserve = frontier.map((item) => ({ supplier_id: item.supplier_id, ...reserveFor(policy, item) })).sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
  const reserveUnknown = reserve.filter((item) => item.state === "UNKNOWN");
  if (reserveUnknown.length) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "HUMAN_REVIEW", reason: "RESERVE_EVIDENCE_UNKNOWN", supplier_dispositions: dispositions, frontier: frontier.map((item) => item.supplier_id), dominance_relations: relations, reserve, recommendation: null, next_action: "HUMAN_REVIEW" });
  const reservePass = reserve.filter((item) => item.state === "PASS");
  if (reservePass.length === 0) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "NO_DEAL", reason: "ALL_FRONTIER_OFFERS_WORSE_THAN_RESERVE", supplier_dispositions: dispositions, frontier: frontier.map((item) => item.supplier_id), dominance_relations: relations, reserve, recommendation: null, next_action: "NO_DEAL" });
  if (reservePass.length > 1) return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "PARETO_FRONTIER", reason: "MULTIPLE_RESERVE_FEASIBLE_FRONTIER_MEMBERS", supplier_dispositions: dispositions, frontier: frontier.map((item) => item.supplier_id), dominance_relations: relations, reserve, recommendation: null, next_action: "HUMAN_REVIEW" });
  const selected = reservePass[0].supplier_id;
  return finish(policy, { round_id: roundId ?? offers[0].round_id, outcome: "RECOMMEND", reason: "ONE_FRONTIER_MEMBER_MEETS_RESERVE", supplier_dispositions: dispositions, frontier: frontier.map((item) => item.supplier_id), dominance_relations: relations, reserve, recommendation: { supplier_id: selected, offer_digest: feasible.find((item) => item.supplier_id === selected).offer_digest }, next_action: "BUYER_REVIEW_AND_APPROVAL" });
}

export function assertDecisionSafe(decision) {
  const forbidden = ["winner", "award_approved", "score", "weights", "send_email", "reply_to_email", "idempotencyKey"];
  for (const key of forbidden) if (Object.prototype.hasOwnProperty.call(decision, key)) fail("FORBIDDEN_DECISION_AUTHORITY", `decision contains forbidden authority field ${key}`);
  if (!OUTCOMES.includes(decision.outcome)) fail("UNKNOWN_OUTCOME", "decision outcome is not in the closed R7 outcome set");
  return true;
}

export const evaluatorContract = Object.freeze({
  purity: "no filesystem, network, clock, Mermail, model, or external effects",
  primary_preference: "explicit Buyer directions only",
  unknown: "missing/blocked/conflict evidence never becomes favorable",
  money: "integer minor units with explicit currency; no implicit conversion",
  recommendation: "RECOMMEND is a Buyer decision input, never an award or effect authorization",
  tie_breaks: "none",
  reserve: "private, explicit, evaluator-only, and no-deal capable",
  frontier: "all feasible non-dominated offers remain visible when incomparable",
});
