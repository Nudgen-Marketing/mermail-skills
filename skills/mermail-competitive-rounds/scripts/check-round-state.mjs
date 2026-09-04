import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROUND_TYPES = new Set(["INITIAL", "BAFO"]);
const ROUND_STATUSES = new Set(["OPEN", "WAITING", "READY_TO_CLOSE", "CLOSED", "BLOCKED"]);
const LANE_STATUSES = new Set([
  "AWAITING_SEND",
  "AWAITING_RECEIPT",
  "AWAITING_RESPONSE",
  "INCOMPLETE",
  "CLARIFICATION_OUTSTANDING",
  "COMPARABLE",
  "DECLINED",
  "WITHDRAWN",
  "EXCLUDED",
  "MISSED_DEADLINE",
  "CONFLICTED",
  "LATE",
  "BLOCKED",
]);
const ROUND_TERMINAL_LANES = new Set([
  "COMPARABLE",
  "DECLINED",
  "WITHDRAWN",
  "EXCLUDED",
  "MISSED_DEADLINE",
]);
const CLOSABLE_UNRESOLVED_LANES = new Set([
  "INCOMPLETE",
  "CLARIFICATION_OUTSTANDING",
  "CONFLICTED",
  "LATE",
]);
const ROUND_BLOCKING_CODES = new Set([
  "invalid_round_status",
  "invalid_round_type",
  "missing_brief",
  "missing_brief_version",
  "missing_disclosure_policy",
  "missing_required_fields",
  "missing_round_id",
  "missing_sourcing_id",
  "round_effect_ambiguous",
  "supplier_set_invalid",
  "lane_set_invalid",
  "bafo_prerequisite_missing",
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function stableIds(values) {
  return [...new Set(asArray(values).filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function normalizeStatus(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  return LANE_STATUSES.has(normalized) ? normalized : null;
}

function isMissing(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function equalValues(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function revisionOrder(revision) {
  const sequence = Number.isFinite(revision.sequence) ? revision.sequence : Number.MAX_SAFE_INTEGER;
  const timestamp = typeof revision.timestamp === "string" ? revision.timestamp : "";
  return [sequence, timestamp, revision.revision_id ?? ""];
}

function compareRevisions(left, right) {
  const a = revisionOrder(left);
  const b = revisionOrder(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

function issue(code, detail, laneId = null) {
  return { code, detail, lane_id: laneId };
}

function sortIssues(values) {
  return values
    .map((value) => ({ code: value.code, detail: value.detail, lane_id: value.lane_id ?? null }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function supplierIds(value) {
  return asArray(value).map((supplier) => {
    if (typeof supplier === "string") return supplier;
    if (supplier && typeof supplier.supplier_id === "string") return supplier.supplier_id;
    return null;
  });
}

function isDraftEvidence(evidence) {
  return (
    evidence?.draft === true ||
    String(evidence?.folder ?? "").toLowerCase() === "drafts" ||
    String(evidence?.status ?? "").toLowerCase() === "draft" ||
    String(evidence?.message_status ?? "").toLowerCase() === "draft"
  );
}

function isActualReceived(evidence) {
  if (isDraftEvidence(evidence)) return false;
  const direction = String(evidence?.direction ?? "").toLowerCase();
  const receivedState = String(evidence?.delivery_state ?? evidence?.status ?? "").toLowerCase();
  return (
    (direction === "received" || direction === "inbound") &&
    (receivedState === "received" || receivedState === "delivered" || evidence?.actual_received === true)
  );
}

function isLateEvidence(evidence) {
  return evidence?.late === true || evidence?.received_after_close === true;
}

function sourceKey(mailboxId, emailId) {
  return `${String(mailboxId)}\u0000${String(emailId)}`;
}

function ancestorMap(revisions) {
  const byId = new Map(revisions.map((revision) => [revision.revision_id, revision]));
  const memo = new Map();
  function ancestors(revisionId, active = new Set()) {
    if (memo.has(revisionId)) return memo.get(revisionId);
    if (active.has(revisionId)) return new Set([revisionId]);
    const revision = byId.get(revisionId);
    const result = new Set();
    if (revision?.supersedes_revision_id) {
      result.add(revision.supersedes_revision_id);
      for (const ancestor of ancestors(revision.supersedes_revision_id, new Set([...active, revisionId]))) {
        result.add(ancestor);
      }
    }
    memo.set(revisionId, result);
    return result;
  }
  return { byId, ancestors };
}

function evaluateLane({ lane, sourcingId, roundId, roundClosed, deadlineReached, requiredFields, selectedRevisionId, globalSourceKeys, errors, warnings }) {
  const supplierId = lane.supplier_id;
  const evidence = asArray(lane.evidence);
  const revisions = asArray(lane.revisions);
  const evidenceById = new Map();
  const draftEvidenceIds = [];
  const actualEvidence = [];
  const lateEvidenceIds = [];

  for (const item of evidence) {
    if (!item || typeof item !== "object") {
      errors.push(issue("invalid_evidence", "Evidence item must be an object.", supplierId));
      continue;
    }
    const evidenceId = item.evidence_id;
    if (typeof evidenceId !== "string" || evidenceId.length === 0 || evidenceById.has(evidenceId)) {
      errors.push(issue("invalid_evidence_id", "Evidence IDs must be non-empty and unique within a lane.", supplierId));
      continue;
    }
    evidenceById.set(evidenceId, item);
    const draft = isDraftEvidence(item);
    if (draft) draftEvidenceIds.push(evidenceId);
    if (item.mailboxId === undefined || item.emailId === undefined) {
      errors.push(issue("evidence_source_incomplete", "Actual evidence requires mailboxId and emailId.", supplierId));
    } else {
      const key = sourceKey(item.mailboxId, item.emailId);
      const priorLane = globalSourceKeys.get(key);
      if (priorLane && priorLane !== supplierId) {
        errors.push(issue("source_cross_lane", "A mailbox-local source pair is bound to more than one supplier lane.", supplierId));
      } else {
        globalSourceKeys.set(key, supplierId);
      }
    }
    if (item.supplier_id !== undefined && item.supplier_id !== supplierId) {
      errors.push(issue("evidence_supplier_mismatch", "Evidence supplier_id does not match its lane.", supplierId));
    }
    if (item.round_id !== undefined && item.round_id !== roundId) {
      errors.push(issue("evidence_round_mismatch", "Evidence round_id does not match the current round.", supplierId));
    }
    if (isLateEvidence(item)) lateEvidenceIds.push(evidenceId);
    if (isActualReceived(item)) actualEvidence.push(item);
  }

  const sourceBinding = lane.source_binding ?? null;
  let sourceBindingValid = null;
  if (sourceBinding !== null) {
    sourceBindingValid = false;
    const bound = evidence.find(
      (item) => item.mailboxId === sourceBinding.mailboxId && item.emailId === sourceBinding.emailId,
    );
    if (!bound) {
      errors.push(issue("source_binding_mismatch", "The bound mailboxId/emailId pair is not present in this lane evidence.", supplierId));
    } else if (isDraftEvidence(bound)) {
      errors.push(issue("source_binding_draft", "A draft cannot be used as a reply source.", supplierId));
    } else {
      sourceBindingValid = true;
      if (!isActualReceived(bound)) {
        sourceBindingValid = false;
        errors.push(issue("source_binding_not_received", "A reply source must be actual received, non-draft evidence.", supplierId));
      }
      if (bound.supplier_id !== undefined && bound.supplier_id !== supplierId) {
        sourceBindingValid = false;
        errors.push(issue("source_binding_mismatch", "The bound source evidence belongs to another supplier lane.", supplierId));
      }
      for (const [field, expected] of [
        ["sourcing_id", lane.sourcing_id ?? sourcingId],
        ["round_id", lane.round_id ?? roundId],
        ["supplier_id", supplierId],
      ]) {
        if (sourceBinding[field] !== undefined && sourceBinding[field] !== expected) {
          sourceBindingValid = false;
          errors.push(issue("source_binding_mismatch", `${field} does not match the lane binding.`, supplierId));
        }
      }
      const localIdentity = sourceBinding.expected_local_identity;
      const remoteIdentity = sourceBinding.expected_remote_counterparty;
      const boundSender = bound.from ?? bound.sender;
      const boundRecipient = bound.to ?? bound.recipient;
      if (localIdentity !== undefined && boundRecipient !== localIdentity) {
        sourceBindingValid = false;
        errors.push(issue("source_binding_identity_mismatch", "The source recipient does not match the expected local identity.", supplierId));
      }
      if (remoteIdentity !== undefined && boundSender !== remoteIdentity) {
        sourceBindingValid = false;
        errors.push(issue("source_binding_identity_mismatch", "The source sender does not match the expected remote counterparty.", supplierId));
      }
    }
  }

  const validRevisions = [];
  const revisionIds = new Set();
  for (const revision of revisions) {
    if (!revision || typeof revision !== "object" || typeof revision.revision_id !== "string") {
      errors.push(issue("invalid_revision", "Revision IDs must be non-empty strings.", supplierId));
      continue;
    }
    if (revisionIds.has(revision.revision_id)) {
      errors.push(issue("duplicate_revision_id", "Revision IDs must be unique within a lane.", supplierId));
      continue;
    }
    revisionIds.add(revision.revision_id);
    const source = evidenceById.get(revision.source_evidence_id);
    if (!source || isDraftEvidence(source) || !isActualReceived(source)) {
      errors.push(issue("revision_source_invalid", "A commercial revision must cite actual received, non-draft evidence.", supplierId));
      continue;
    }
    if (revision.valid === false) continue;
    validRevisions.push(revision);
  }

  const currentCandidates = validRevisions.filter((revision) => !revision.late && !isLateEvidence(evidenceById.get(revision.source_evidence_id)));
  const { byId: revisionById, ancestors } = ancestorMap(currentCandidates);
  const conflictFields = new Set();
  for (let leftIndex = 0; leftIndex < currentCandidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < currentCandidates.length; rightIndex += 1) {
      const left = currentCandidates[leftIndex];
      const right = currentCandidates[rightIndex];
      const related = ancestors(left.revision_id).has(right.revision_id) || ancestors(right.revision_id).has(left.revision_id);
      if (related) continue;
      const fields = new Set([...Object.keys(left.fields ?? {}), ...Object.keys(right.fields ?? {})]);
      for (const field of fields) {
        const leftValue = left.fields?.[field];
        const rightValue = right.fields?.[field];
        if (!isMissing(leftValue) && !isMissing(rightValue) && !equalValues(leftValue, rightValue)) {
          conflictFields.add(field);
        }
      }
    }
  }
  if (conflictFields.size > 0) {
    warnings.push(issue("contradictory_revisions", "Contradictory non-successor revisions remain unresolved.", supplierId));
  }

  const roundSelected = selectedRevisionId ?? lane.selected_revision_id ?? null;
  let selectedRevision = null;
  if (roundSelected) {
    selectedRevision = revisionById.get(roundSelected) ?? null;
    if (!selectedRevision) {
      errors.push(issue("selected_revision_invalid", "Selected revision is not a valid non-late revision.", supplierId));
    }
  } else if (currentCandidates.length > 0 && conflictFields.size === 0) {
    selectedRevision = [...currentCandidates].sort(compareRevisions).at(-1) ?? null;
  }

  let currentFields = {};
  if (selectedRevision && conflictFields.size === 0) {
    const chain = [];
    let cursor = selectedRevision;
    const seen = new Set();
    while (cursor && !seen.has(cursor.revision_id)) {
      chain.push(cursor);
      seen.add(cursor.revision_id);
      cursor = revisionById.get(cursor.supersedes_revision_id) ?? null;
    }
    for (const revision of chain.reverse()) currentFields = { ...currentFields, ...(revision.fields ?? {}) };
  } else if (conflictFields.size > 0) {
    selectedRevision = null;
  }

  const missingFields = requiredFields.filter((field) => isMissing(currentFields[field]));
  const onlyLateResponse = actualEvidence.length > 0 && actualEvidence.every(isLateEvidence);
  let derivedStatus;
  const explicitDisposition = normalizeStatus(lane.disposition);
  if (sourceBindingValid === false) {
    derivedStatus = "BLOCKED";
  } else if (lane.effect_status && ["ambiguous", "uncertain", "unknown"].includes(String(lane.effect_status).toLowerCase())) {
    derivedStatus = "BLOCKED";
  } else if (lane.blocked === true || normalizeStatus(lane.lane_status) === "BLOCKED") {
    derivedStatus = "BLOCKED";
  } else if (explicitDisposition && ["DECLINED", "WITHDRAWN", "EXCLUDED", "BLOCKED"].includes(explicitDisposition)) {
    derivedStatus = explicitDisposition;
  } else if (lane.stage && ["AWAITING_SEND", "AWAITING_RECEIPT"].includes(String(lane.stage).toUpperCase())) {
    derivedStatus = String(lane.stage).toUpperCase();
  } else if (onlyLateResponse && roundClosed) {
    derivedStatus = "LATE";
  } else if (actualEvidence.length === 0) {
    if (roundClosed || deadlineReached || lane.deadline_missed === true) derivedStatus = "MISSED_DEADLINE";
    else if (String(lane.stage ?? "").toUpperCase() === "AWAITING_RECEIPT") derivedStatus = "AWAITING_RECEIPT";
    else if (String(lane.stage ?? "").toUpperCase() === "AWAITING_SEND") derivedStatus = "AWAITING_SEND";
    else derivedStatus = "AWAITING_RESPONSE";
  } else if (conflictFields.size > 0) {
    derivedStatus = "CONFLICTED";
  } else if (missingFields.length > 0) {
    derivedStatus = lane.clarification_outstanding === true ? "CLARIFICATION_OUTSTANDING" : "INCOMPLETE";
  } else {
    derivedStatus = "COMPARABLE";
  }

  if (lane.lane_status !== undefined && normalizeStatus(lane.lane_status) !== derivedStatus) {
    errors.push(issue("lane_status_mismatch", `Input lane_status does not match derived ${derivedStatus}.`, supplierId));
  }
  if (draftEvidenceIds.length > 0 && actualEvidence.length === 0) {
    warnings.push(issue("draft_response_excluded", "Draft evidence cannot satisfy a supplier-response requirement.", supplierId));
  }
  if (!LANE_STATUSES.has(derivedStatus)) {
    errors.push(issue("invalid_derived_lane_status", "Lane status is not in the frozen vocabulary.", supplierId));
  }

  let disposition = explicitDisposition;
  if (!disposition && ROUND_TERMINAL_LANES.has(derivedStatus)) disposition = derivedStatus;
  const lateRevisionIds = validRevisions.filter((revision) => revision.late || isLateEvidence(evidenceById.get(revision.source_evidence_id))).map((revision) => revision.revision_id).sort();

  return {
    supplier_id: supplierId,
    lane_status: derivedStatus,
    disposition: disposition ? disposition.toLowerCase() : null,
    missing_fields: missingFields,
    conflict_fields: [...conflictFields].sort(),
    current_revision_id: selectedRevision?.revision_id ?? null,
    current_fields: selectedRevision ? clone(currentFields) : null,
    response_evidence_ids: actualEvidence.map((item) => item.evidence_id).sort(),
    draft_evidence_ids: draftEvidenceIds.sort(),
    late_evidence_ids: lateEvidenceIds.sort(),
    late_revision_ids: lateRevisionIds,
    source_binding_valid: sourceBindingValid,
  };
}

function evaluateDisclosure(packet) {
  if (!packet) return { allowed: true, violations: [] };
  const target = packet.target_supplier_id;
  const authorizations = asArray(packet.authorizations);
  const violations = [];
  for (const item of asArray(packet.items)) {
    const classification = String(item?.classification ?? "").toLowerCase();
    const targetOwnLane = item?.supplier_id !== undefined && item.supplier_id === target;
    const crossSupplier = item?.supplier_id !== undefined && !targetOwnLane;
    const privateInformation = ["competitor_private", "buyer_private", "comparative"].includes(classification) ||
      (classification === "supplier_private" && !targetOwnLane);
    if (!crossSupplier && !privateInformation) continue;
    const authorized = authorizations.some(
      (authorization) =>
        authorization?.approved === true &&
        authorization.target_supplier_id === target &&
        (authorization.supplier_id ?? null) === (item.supplier_id ?? null) &&
        asArray(authorization.fields).includes(item.field),
    );
    if (!authorized) {
      violations.push({
        code: "unauthorized_competitive_disclosure",
        target_supplier_id: target ?? null,
        source_supplier_id: item?.supplier_id ?? null,
        field: item?.field ?? null,
      });
    }
  }
  violations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { allowed: violations.length === 0, violations };
}

function normalizePolicyStatuses(policy) {
  return stableIds(asArray(policy?.eligible_lane_statuses).map((status) => normalizeStatus(status)).filter(Boolean));
}

function bafoPrerequisites({ input, round, roundType, lanes, requiredFields, topDisclosurePolicy, errors }) {
  if (roundType !== "BAFO") {
    return { can_open: false, missing_prerequisites: [], eligible_supplier_ids: null, eligibility_policy_status: "NOT_APPLICABLE" };
  }
  const missing = [];
  const initial = input.initial_round;
  if (!initial || initial.round_type !== "INITIAL" || (initial.round_status !== "CLOSED" && initial.closure?.closed !== true)) {
    missing.push("INITIAL_CLOSED");
  }
  if (initial?.round_id !== undefined && initial.round_id === round.round_id) missing.push("DISTINCT_BAFO_ROUND_ID");
  const eligible = stableIds(asArray(round.eligible_supplier_ids));
  if (round.eligible_set_frozen !== true || eligible.length === 0) missing.push("FROZEN_ELIGIBLE_SUPPLIER_SET");
  if (!nonEmptyObject(round.requirement_snapshot ?? input.requirement_snapshot)) missing.push("FROZEN_REQUIREMENT_SNAPSHOT");
  if (isMissing(round.deadline ?? input.deadline)) missing.push("COMMON_DEADLINE");
  if (!Array.isArray(round.required_fields) || round.required_fields.length === 0) missing.push("FINAL_REQUIRED_FIELDS");
  if (!nonEmptyObject(round.disclosure_policy ?? topDisclosurePolicy)) missing.push("DISCLOSURE_POLICY");
  for (const supplierId of eligible) {
    if (!lanes.some((lane) => lane.supplier_id === supplierId)) {
      missing.push(`KNOWN_ELIGIBLE_SUPPLIER:${supplierId}`);
    }
  }
  const uniqueMissing = [...new Set(missing)].sort();
  if (uniqueMissing.length > 0) {
    errors.push(issue("bafo_prerequisite_missing", uniqueMissing.join(", ")));
  }
  return {
    can_open: uniqueMissing.length === 0,
    missing_prerequisites: uniqueMissing,
    eligible_supplier_ids: eligible.length > 0 ? eligible : null,
    eligibility_policy_status: "FROZEN",
  };
}

export function evaluateRound(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      out_of_scope: false,
      errors: [issue("invalid_input", "Input must be one JSON object.")],
      warnings: [],
    };
  }

  const intent = String(input.workflow_intent ?? "").toLowerCase();
  if (["proposal_comparison", "compare_proposals", "evaluation_only"].includes(intent)) {
    return {
      valid: true,
      out_of_scope: true,
      reason: "not_a_competitive_round",
      errors: [],
      warnings: [],
    };
  }

  const round = input.round && typeof input.round === "object" ? input.round : {};
  const sourcingId = input.sourcing_id;
  const briefVersion = input.brief_version;
  const brief = input.brief ?? input.frozen_brief;
  const roundId = round.round_id ?? input.round_id;
  const roundType = round.round_type ?? input.round_type;
  const inputRoundStatus = round.round_status ?? input.round_status;
  const requiredFields = stableIds(round.required_fields ?? input.required_fields);
  const topDisclosurePolicy = input.disclosure_policy;
  const supplierSet = stableIds(supplierIds(input.supplier_set));
  const lanesInput = asArray(input.supplier_lanes);

  if (typeof sourcingId !== "string" || sourcingId.length === 0) errors.push(issue("missing_sourcing_id", "sourcing_id is required."));
  if (typeof briefVersion !== "string" || briefVersion.length === 0) errors.push(issue("missing_brief_version", "brief_version is required and frozen."));
  if (!nonEmptyObject(brief)) errors.push(issue("missing_brief", "A frozen brief object is required."));
  if (typeof roundId !== "string" || roundId.length === 0) errors.push(issue("missing_round_id", "round_id is required."));
  if (!ROUND_TYPES.has(roundType)) errors.push(issue("invalid_round_type", "round_type must be INITIAL or BAFO."));
  if (inputRoundStatus !== undefined && !ROUND_STATUSES.has(inputRoundStatus)) {
    errors.push(issue("invalid_round_status", "round_status is not in the frozen vocabulary."));
  }
  if (requiredFields.length === 0) errors.push(issue("missing_required_fields", "At least one required commercial field is required."));
  if (!nonEmptyObject(topDisclosurePolicy) && !nonEmptyObject(round.disclosure_policy)) {
    errors.push(issue("missing_disclosure_policy", "A disclosure policy is required."));
  }
  if (supplierSet.length < 2) errors.push(issue("supplier_set_invalid", "A competitive round requires at least two suppliers."));
  if (lanesInput.length < 2) errors.push(issue("lane_set_invalid", "A competitive round requires at least two supplier lanes."));

  if (supplierSet.length < 2 || lanesInput.length < 2) {
    return {
      valid: false,
      out_of_scope: true,
      reason: "competitive_round_requires_two_or_more_suppliers",
      common: { sourcing_id: sourcingId ?? null, brief_version: briefVersion ?? null, supplier_ids: supplierSet },
      round: { round_id: roundId ?? null, round_type: roundType ?? null, derived_status: "BLOCKED" },
      errors: sortIssues(errors),
      warnings: [],
    };
  }

  if (new Set(supplierSet).size !== supplierSet.length) {
    errors.push(issue("supplier_set_invalid", "Supplier IDs must be unique."));
  }
  const laneIds = lanesInput.map((lane) => lane?.supplier_id).filter((value) => typeof value === "string");
  if (new Set(laneIds).size !== laneIds.length) errors.push(issue("lane_set_invalid", "Supplier lane IDs must be unique."));
  const missingLanes = supplierSet.filter((supplierId) => !laneIds.includes(supplierId));
  const extraLanes = laneIds.filter((supplierId) => !supplierSet.includes(supplierId));
  if (missingLanes.length > 0) errors.push(issue("lane_set_invalid", `Missing supplier lanes: ${missingLanes.join(", ")}.`));
  if (extraLanes.length > 0) errors.push(issue("lane_set_invalid", `Unknown supplier lanes: ${extraLanes.join(", ")}.`));

  const roundClosed = inputRoundStatus === "CLOSED" || round.closure?.closed === true;
  const closure = round.closure && typeof round.closure === "object" ? round.closure : {};
  const deadlineReached = closure.deadline_reached === true;
  const globalSourceKeys = new Map();
  const lanes = lanesInput
    .filter((lane) => lane && typeof lane === "object" && typeof lane.supplier_id === "string")
    .sort((left, right) => left.supplier_id.localeCompare(right.supplier_id))
    .map((lane) =>
      evaluateLane({
        lane,
        sourcingId,
        roundId,
        roundClosed,
        deadlineReached,
        requiredFields,
        selectedRevisionId: round.selected_revision_ids?.[lane.supplier_id],
        globalSourceKeys,
        errors,
        warnings,
      }),
    );

  const ignoredInstructions = lanesInput.reduce((count, lane) => {
    const laneCount = asArray(lane?.untrusted_instructions).length;
    const evidenceCount = asArray(lane?.evidence).reduce((sum, evidence) => sum + asArray(evidence?.untrusted_instructions).length, 0);
    return count + laneCount + evidenceCount;
  }, 0);

  const roundEffects = asArray(round.effects ?? input.round_effects);
  if (roundEffects.some((effect) => ["ambiguous", "uncertain", "unknown"].includes(String(effect?.status ?? "").toLowerCase()))) {
    errors.push(issue("round_effect_ambiguous", "An unresolved round-level external effect blocks advancement."));
  }

  const disclosure = evaluateDisclosure(input.proposed_disclosure);
  if (!disclosure.allowed) {
    for (const violation of disclosure.violations) {
      errors.push(issue(violation.code, `${violation.field ?? "field"} is not authorized for this target lane.`));
    }
  }

  const eligibilityPolicy = round.eligibility_policy ?? input.eligibility_policy;
  let bafo;
  if (roundType === "INITIAL" && roundClosed) {
    const eligibleStatuses = normalizePolicyStatuses(eligibilityPolicy);
    if (eligibleStatuses.length === 0) {
      warnings.push(issue("eligibility_policy_missing", "BAFO eligibility remains unknown because no frozen eligibility policy was supplied."));
      bafo = {
        eligible_supplier_ids: null,
        eligibility_policy_status: "UNSPECIFIED",
        can_open: false,
        missing_prerequisites: ["ELIGIBILITY_POLICY"],
      };
    } else {
      const eligibleSupplierIds = lanes
        .filter((lane) => eligibleStatuses.includes(lane.lane_status))
        .map((lane) => lane.supplier_id)
        .sort();
      bafo = {
        eligible_supplier_ids: eligibleSupplierIds,
        eligibility_policy_status: "FROZEN",
        can_open: true,
        missing_prerequisites: [],
      };
    }
  } else {
    bafo = bafoPrerequisites({
      input,
      round,
      roundType,
      lanes,
      requiredFields,
      topDisclosurePolicy,
      errors,
    });
  }

  const allowUnresolved = closure.allow_unresolved === true;
  const laneResolved = lanes.every(
    (lane) =>
      ROUND_TERMINAL_LANES.has(lane.lane_status) ||
      (deadlineReached && allowUnresolved && CLOSABLE_UNRESOLVED_LANES.has(lane.lane_status)),
  );
  const roundBlocking = errors.some((error) => ROUND_BLOCKING_CODES.has(error.code));
  const inputBlocked = inputRoundStatus === "BLOCKED";
  let derivedStatus;
  if (roundBlocking || inputBlocked) derivedStatus = "BLOCKED";
  else if (roundClosed) derivedStatus = "CLOSED";
  else if (laneResolved) derivedStatus = "READY_TO_CLOSE";
  else if (inputRoundStatus === "OPEN") derivedStatus = "OPEN";
  else derivedStatus = "WAITING";

  if (roundClosed && !laneResolved && !roundBlocking) {
    errors.push(issue("closed_round_not_ready", "A closed round must have an explicit disposition for every lane."));
    derivedStatus = "BLOCKED";
  }

  const finalEligibleIds = bafo.eligible_supplier_ids ?? [];
  const finalLaneSet = new Set(finalEligibleIds);
  const finalLanesResolved = finalEligibleIds.length > 0 && finalEligibleIds.every((supplierId) => {
    const lane = lanes.find((candidate) => candidate.supplier_id === supplierId);
    return lane && ROUND_TERMINAL_LANES.has(lane.lane_status);
  });
  const recommendationReady =
    roundType === "BAFO" &&
    derivedStatus === "CLOSED" &&
    bafo.can_open &&
    finalLaneSet.size === finalEligibleIds.length &&
    finalLanesResolved &&
    !disclosure.violations.length &&
    errors.length === 0;

  const result = {
    valid: errors.length === 0,
    out_of_scope: false,
    common: {
      sourcing_id: sourcingId ?? null,
      brief_version: briefVersion ?? null,
      frozen_brief: clone(brief) ?? null,
      supplier_ids: supplierSet,
      required_fields: requiredFields,
      evaluation_policy: clone(input.evaluation_policy ?? input.comparability_policy) ?? null,
      disclosure_policy: clone(topDisclosurePolicy ?? round.disclosure_policy) ?? null,
      ignored_untrusted_instruction_count: ignoredInstructions,
    },
    round: {
      round_id: roundId ?? null,
      round_type: roundType ?? null,
      input_status: inputRoundStatus ?? null,
      derived_status: derivedStatus,
      deadline: round.deadline ?? input.deadline ?? null,
      deadline_reached: deadlineReached,
      ready_to_close: derivedStatus === "READY_TO_CLOSE",
      closed: derivedStatus === "CLOSED",
      selected_revision_ids: clone(round.selected_revision_ids ?? {}) ?? {},
    },
    lanes,
    bafo,
    disclosure,
    recommendation_ready: recommendationReady,
    errors: sortIssues(errors),
    warnings: sortIssues(warnings),
  };
  return result;
}

async function readInput() {
  if (process.argv[2]) return JSON.parse(await readFile(process.argv[2], "utf8"));
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = await readInput();
    process.stdout.write(`${JSON.stringify(evaluateRound(input), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ valid: false, out_of_scope: false, errors: [issue("invalid_json", error.message)] }, null, 2)}\n`,
    );
    process.exitCode = 1;
  }
}
