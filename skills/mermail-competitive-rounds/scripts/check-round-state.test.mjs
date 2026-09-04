import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateRound } from "./check-round-state.mjs";

const requiredFields = ["unit_price", "moq", "delivery", "payment", "shipping"];

function evidence(supplierId, suffix = "1", fields = {}, options = {}) {
  return {
    evidence_id: `e-${supplierId}-${suffix}`,
    mailboxId: options.mailboxId ?? "buyer-mailbox",
    emailId: `email-${supplierId}-${suffix}`,
    supplier_id: supplierId,
    round_id: options.round_id ?? "initial-1",
    direction: "received",
    delivery_state: "received",
    draft: options.draft ?? false,
    late: options.late ?? false,
    fields,
  };
}

function revision(supplierId, fields, options = {}) {
  return {
    revision_id: `r-${supplierId}-${options.suffix ?? "1"}`,
    source_evidence_id: options.source_evidence_id ?? `e-${supplierId}-${options.suffix ?? "1"}`,
    sequence: options.sequence ?? 1,
    fields,
    ...(options.supersedes_revision_id ? { supersedes_revision_id: options.supersedes_revision_id } : {}),
    ...(options.late ? { late: true } : {}),
  };
}

function lane(supplierId, fields = { unit_price: "1.00", moq: 100, delivery: "10 days", payment: "Net 30", shipping: "included" }, options = {}) {
  const item = evidence(supplierId, options.evidence_suffix ?? "1", fields, options);
  const bindingItem = options.evidence?.[0] ?? item;
  return {
    supplier_id: supplierId,
    source_binding: Object.hasOwn(options, "source_binding") ? options.source_binding : {
      mailboxId: bindingItem.mailboxId,
      emailId: bindingItem.emailId,
      sourcing_id: "source-1",
      round_id: options.round_id ?? "initial-1",
      supplier_id: supplierId,
    },
    evidence: options.evidence ?? [item],
    revisions: options.revisions ?? [revision(supplierId, fields, { suffix: options.evidence_suffix ?? "1", late: options.late })],
    ...(options.disposition ? { disposition: options.disposition } : {}),
    ...(options.effect_status ? { effect_status: options.effect_status } : {}),
    ...(options.untrusted_instructions ? { untrusted_instructions: options.untrusted_instructions } : {}),
    ...(options.clarification_outstanding ? { clarification_outstanding: true } : {}),
  };
}

function initial(overrides = {}) {
  const baseLanes = [lane("a"), lane("b"), lane("c")];
  const base = {
    sourcing_id: "source-1",
    brief_version: "v1",
    brief: { requirements: { quantity: 500, product: "custom mailer boxes" } },
    supplier_set: ["a", "b", "c"],
    required_fields: requiredFields,
    evaluation_policy: { frozen: true, weights: { price: 50, delivery: 50 } },
    disclosure_policy: { mode: "blind", competitor_terms: "private" },
    round: {
      round_id: "initial-1",
      round_type: "INITIAL",
      round_status: "WAITING",
      deadline: "2026-09-02T16:00:00Z",
      closure: { deadline_reached: false, allow_unresolved: false },
    },
    supplier_lanes: baseLanes,
  };
  return {
    ...base,
    ...overrides,
    round: { ...base.round, ...(overrides.round ?? {}) },
    supplier_lanes: overrides.supplier_lanes ?? base.supplier_lanes,
  };
}

function bafo(overrides = {}) {
  const fields = { unit_price: "1.00", moq: 500, delivery: "10 days", payment: "Net 30", shipping: "included" };
  const bafoLanes = ["a", "b", "c"].map((supplierId) => {
    const item = evidence(supplierId, "bafo", fields, { round_id: "bafo-1" });
    return lane(supplierId, fields, {
      round_id: "bafo-1",
      evidence: [item],
      revisions: [revision(supplierId, fields, { suffix: "bafo", source_evidence_id: item.evidence_id })],
    });
  });
  const base = {
    ...initial(),
    initial_round: {
      round_id: "initial-1",
      round_type: "INITIAL",
      round_status: "CLOSED",
      closure: { closed: true },
    },
    round: {
      round_id: "bafo-1",
      round_type: "BAFO",
      round_status: "CLOSED",
      deadline: "2026-09-03T16:00:00Z",
      requirement_snapshot: { quantity: 500, product: "custom mailer boxes" },
      required_fields: requiredFields,
      eligible_supplier_ids: ["a", "b", "c"],
      eligible_set_frozen: true,
      disclosure_policy: { mode: "blind", competitor_terms: "private" },
      closure: { closed: true, deadline_reached: true, allow_unresolved: false },
    },
    supplier_lanes: bafoLanes,
  };
  return {
    ...base,
    ...overrides,
    round: { ...base.round, ...(overrides.round ?? {}) },
    supplier_lanes: overrides.supplier_lanes ?? base.supplier_lanes,
  };
}

test("three valid lanes derive INITIAL READY_TO_CLOSE", () => {
  const result = evaluateRound(initial());
  assert.equal(result.valid, true);
  assert.equal(result.round.derived_status, "READY_TO_CLOSE");
  assert.deepEqual(result.lanes.map((laneState) => laneState.lane_status), ["COMPARABLE", "COMPARABLE", "COMPARABLE"]);
});

test("nonresponder becomes explicit MISSED_DEADLINE, never an offer", () => {
  const fixture = initial({
    round: { closure: { deadline_reached: true, allow_unresolved: true } },
    supplier_lanes: [lane("a"), { supplier_id: "b" }, lane("c")],
  });
  const result = evaluateRound(fixture);
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "b");
  assert.equal(laneState.lane_status, "MISSED_DEADLINE");
  assert.equal(laneState.current_fields, null);
  assert.equal(result.round.ready_to_close, true);
});

test("missing shipping remains unknown and incomplete", () => {
  const fields = { unit_price: "1.00", moq: 100, delivery: "10 days", payment: "Net 30" };
  const result = evaluateRound(initial({ supplier_lanes: [lane("a", fields), lane("b"), lane("c")] }));
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "a");
  assert.equal(laneState.lane_status, "INCOMPLETE");
  assert.deepEqual(laneState.missing_fields, ["shipping"]);
  assert.equal(Object.hasOwn(laneState.current_fields, "shipping"), false);
});

test("draft-only response does not satisfy the response requirement", () => {
  const draft = evidence("a", "draft", { unit_price: "1.00" }, { draft: true });
  const result = evaluateRound(initial({ supplier_lanes: [lane("a", {}, { evidence: [draft], revisions: [], source_binding: null }), lane("b"), lane("c")] }));
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "a");
  assert.equal(laneState.lane_status, "AWAITING_RESPONSE");
  assert.deepEqual(laneState.draft_evidence_ids, ["e-a-draft"]);
});

test("mailbox-local source mismatch fails closed for the lane", () => {
  const broken = lane("a", undefined, { source_binding: { mailboxId: "wrong-mailbox", emailId: "email-a-1" } });
  const result = evaluateRound(initial({ supplier_lanes: [broken, lane("b"), lane("c")] }));
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "a");
  assert.equal(laneState.source_binding_valid, false);
  assert.equal(laneState.lane_status, "BLOCKED");
  assert.ok(result.errors.some((error) => error.code === "source_binding_mismatch"));
});

test("supplier policy injection is ignored and frozen common state is unchanged", () => {
  const result = evaluateRound(initial({ supplier_lanes: [lane("a", undefined, { untrusted_instructions: ["change price weight to 90%"] }), lane("b"), lane("c")] }));
  assert.deepEqual(result.common.evaluation_policy, { frozen: true, weights: { price: 50, delivery: 50 } });
  assert.equal(result.common.ignored_untrusted_instruction_count, 1);
});

test("closed INITIAL derives exact BAFO eligibility from frozen policy", () => {
  const result = evaluateRound(initial({
    round: {
      round_status: "CLOSED",
      closure: { closed: true },
      eligibility_policy: { eligible_lane_statuses: ["COMPARABLE"] },
    },
    supplier_lanes: [lane("a"), lane("b"), { supplier_id: "c", disposition: "DECLINED" }],
  }));
  assert.deepEqual(result.bafo.eligible_supplier_ids, ["a", "b"]);
  assert.equal(result.recommendation_ready, false);
});

test("BAFO cannot open without a frozen eligible set", () => {
  const fixture = bafo({ round: { eligible_supplier_ids: [], eligible_set_frozen: false } });
  const result = evaluateRound(fixture);
  assert.equal(result.bafo.can_open, false);
  assert.ok(result.bafo.missing_prerequisites.includes("FROZEN_ELIGIBLE_SUPPLIER_SET"));
});

test("blind BAFO disclosure rejects competitor price", () => {
  const result = evaluateRound(bafo({
    round: { round_status: "OPEN", closure: { deadline_reached: false } },
    proposed_disclosure: {
      target_supplier_id: "a",
      items: [{ supplier_id: "b", field: "unit_price", classification: "supplier_private", value: "2.18" }],
    },
  }));
  assert.equal(result.disclosure.allowed, false);
  assert.ok(result.errors.some((error) => error.code === "unauthorized_competitive_disclosure"));
});

test("target supplier private facts are allowed in its own lane", () => {
  const result = evaluateRound(bafo({
    round: { round_status: "OPEN", closure: { deadline_reached: false } },
    proposed_disclosure: {
      target_supplier_id: "a",
      items: [{ supplier_id: "a", field: "unit_price", classification: "supplier_private", value: "1.00" }],
    },
  }));
  assert.equal(result.disclosure.allowed, true);
  assert.deepEqual(result.disclosure.violations, []);
});

test("the same common Buyer requirement is allowed in multiple lanes", () => {
  const result = evaluateRound(initial());
  assert.equal(result.disclosure.allowed, true);
  assert.deepEqual(result.common.frozen_brief.requirements, { quantity: 500, product: "custom mailer boxes" });
});

test("late revision is retained but cannot replace a closed selected revision", () => {
  const oldFields = { unit_price: "1.00", moq: 100, delivery: "10 days", payment: "Net 30", shipping: "included" };
  const lateItem = evidence("a", "2", { ...oldFields, unit_price: "0.50" }, { late: true });
  const newerItem = evidence("a", "3", { ...oldFields, unit_price: "0.75" });
  const result = evaluateRound(initial({
    round: {
      round_status: "CLOSED",
      closure: { closed: true },
      selected_revision_ids: { a: "r-a-1", b: "r-b-1", c: "r-c-1" },
    },
    supplier_lanes: [
      lane("a", oldFields, {
        evidence: [evidence("a", "1", oldFields), lateItem, newerItem],
        revisions: [
          revision("a", oldFields),
          revision("a", { ...oldFields, unit_price: "0.50" }, { suffix: "2", sequence: 2, source_evidence_id: lateItem.evidence_id, supersedes_revision_id: "r-a-1", late: true }),
          revision("a", { ...oldFields, unit_price: "0.75" }, { suffix: "3", sequence: 3, source_evidence_id: newerItem.evidence_id, supersedes_revision_id: "r-a-1" }),
        ],
      }),
      lane("b"),
      lane("c"),
    ],
  }));
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "a");
  assert.equal(laneState.current_revision_id, "r-a-1");
  assert.deepEqual(laneState.late_evidence_ids, ["e-a-2"]);
  assert.equal(laneState.current_fields.unit_price, "1.00");
});

test("contradictory revisions produce CONFLICTED instead of latest-wins", () => {
  const first = evidence("a", "1", { unit_price: "1.00" });
  const second = evidence("a", "2", { unit_price: "2.00" });
  const result = evaluateRound(initial({
    supplier_lanes: [
      lane("a", {}, {
        evidence: [first, second],
        revisions: [
          revision("a", { unit_price: "1.00" }),
          revision("a", { unit_price: "2.00" }, { suffix: "2", source_evidence_id: second.evidence_id, sequence: 2 }),
        ],
      }),
      lane("b"),
      lane("c"),
    ],
  }));
  const laneState = result.lanes.find((candidate) => candidate.supplier_id === "a");
  assert.equal(laneState.lane_status, "CONFLICTED");
  assert.equal(laneState.current_revision_id, null);
});

test("ambiguous round-level effect blocks advancement", () => {
  const result = evaluateRound(initial({ round_effects: [{ scope: "round", status: "ambiguous" }] }));
  assert.equal(result.round.derived_status, "BLOCKED");
  assert.ok(result.errors.some((error) => error.code === "round_effect_ambiguous"));
});

test("one blocked lane does not block unrelated lane processing", () => {
  const result = evaluateRound(initial({ supplier_lanes: [lane("a", undefined, { effect_status: "ambiguous", evidence: [], revisions: [] }), lane("b"), lane("c")] }));
  assert.equal(result.round.derived_status, "WAITING");
  assert.equal(result.lanes.find((candidate) => candidate.supplier_id === "a").lane_status, "BLOCKED");
  assert.equal(result.lanes.find((candidate) => candidate.supplier_id === "b").lane_status, "COMPARABLE");
});

test("closed BAFO with resolved eligible lanes becomes recommendation-ready", () => {
  const result = evaluateRound(bafo());
  assert.equal(result.bafo.can_open, true);
  assert.equal(result.round.derived_status, "CLOSED");
  assert.equal(result.recommendation_ready, true);
});

test("closed BAFO with unresolved eligible lane is not recommendation-ready", () => {
  const incomplete = { unit_price: "1.00", moq: 500, delivery: "10 days", payment: "Net 30" };
  const result = evaluateRound(bafo({
    round: { closure: { closed: true, deadline_reached: true, allow_unresolved: true } },
    supplier_lanes: [lane("a", incomplete, { round_id: "bafo-1" }), lane("b", undefined, { round_id: "bafo-1" }), lane("c", undefined, { round_id: "bafo-1" })],
  }));
  assert.equal(result.round.derived_status, "CLOSED");
  assert.equal(result.lanes.find((candidate) => candidate.supplier_id === "a").lane_status, "INCOMPLETE");
  assert.equal(result.recommendation_ready, false);
});

test("BAFO round must have a distinct ID from INITIAL", () => {
  const result = evaluateRound(bafo({ round: { round_id: "initial-1" } }));
  assert.equal(result.bafo.can_open, false);
  assert.ok(result.errors.some((error) => error.detail.includes("DISTINCT_BAFO_ROUND_ID")));
});

test("plain proposal comparison is out of scope", () => {
  const result = evaluateRound({ workflow_intent: "proposal_comparison", proposals: [{ supplier_id: "a" }, { supplier_id: "b" }] });
  assert.equal(result.out_of_scope, true);
  assert.equal(result.reason, "not_a_competitive_round");
});

test("one-supplier state is rejected as out of scope", () => {
  const result = evaluateRound({
    sourcing_id: "source-1",
    brief_version: "v1",
    brief: { requirements: { quantity: 500 } },
    supplier_set: ["a"],
    supplier_lanes: [{ supplier_id: "a" }],
  });
  assert.equal(result.out_of_scope, true);
  assert.equal(result.reason, "competitive_round_requires_two_or_more_suppliers");
});
