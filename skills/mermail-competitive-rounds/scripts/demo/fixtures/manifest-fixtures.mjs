import {
  AUTHORITY,
  ROUND_TYPES,
  canonicalize,
  normalizeManifest,
  freezeManifest,
  openInitialRound,
  closeInitialRound,
  openFinalRound,
  compileCommonPacket,
  compileSupplierPacket,
  sha256Canonical,
} from "../../runtime/authority/manifest-round-compiler.mjs";

export function makeManifest(overrides = {}) {
  const base = {
    manifest_schema_version: "r3.v1",
    sourcing_id: "source-001",
    manifest_revision: 1,
    created_at: "2026-09-01T10:00:00Z",
    buyer_authority_ref: "buyer-authority-001",
    supplier_roster: [
      { supplier_id: "supplier-a", address: "supplier-a@example.test", identity_ref: "buyer-declared-a" },
      { supplier_id: "supplier-b", address: "supplier-b@example.test", identity_ref: "buyer-declared-b" },
    ],
    common_requirements: [
      { name: "delivery-days", type: "integer", unit: "day" },
      { name: "total-price", type: "money", currency: "USD" },
      { name: "warranty", type: "duration", unit: "month" },
    ],
    hard_must_haves: [
      { field: "delivery-days", operator: "lte", value: 14, unit: "day" },
    ],
    decision_attributes: [
      { field: "delivery-days", direction: "minimize" },
      { field: "total-price", direction: "minimize" },
    ],
    normalization_policy: [
      { field: "total-price", unit: "amount", currency: "USD" },
      { field: "warranty", unit: "month" },
    ],
    deadline_policy: {
      initial_cutoff_at: "2026-09-10T17:00:00Z",
      final_cutoff_at: "2026-09-12T17:00:00Z",
      cutoff_inclusive: false,
      timezone: "UTC",
    },
    late_evidence_policy: "preserve_as_late",
    round_sequence_policy: {
      final_revision_enabled: true,
      max_final_revision_rounds: 1,
      final_eligibility_rule: "responded_on_time_not_withdrawn",
    },
    revision_policy: {
      amendment_mode: "append_only",
      protected_after_initial_open: true,
    },
    clarification_disclosure_policy: "lane_only",
    no_deal_policy_ref: "buyer-no-deal-policy-001",
    approval_policy_ref: "buyer-effect-policy-001",
  };
  return deepMerge(base, overrides);
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return overrides === undefined ? structuredClone(base) : overrides;
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) result[key] = deepMerge(result[key], value);
    else result[key] = structuredClone(value);
  }
  return result;
}

export function makeApproval(manifest, action = "freeze_manifest", extra = {}) {
  const digest = sha256Canonical(normalizeManifest(manifest));
  return {
    action,
    purpose: action === "freeze_manifest" ? "freeze buyer sourcing policy" : "amend buyer sourcing policy",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: manifest.buyer_authority_ref },
    sourcing_id: manifest.sourcing_id,
    manifest_revision: manifest.manifest_revision,
    manifest_digest: digest,
    approver_ref: "operator-001",
    approved_at: "2026-09-02T10:00:00Z",
    ...extra,
  };
}

export function makeStubObservation(supplier_id, response_status = "RESPONDED", response_at, extra = {}) {
  if (arguments.length < 3) response_at = "2026-09-05T10:00:00Z";
  const result = {
    supplier_id,
    response_status,
    origin: { kind: AUTHORITY.SUPPLIER_EVIDENCE, reference: `stub-${supplier_id}`, verification: "UNVERIFIED_STUB" },
    ...extra,
  };
  if (response_at !== undefined) result.response_at = response_at;
  return result;
}

export function buildInitialScenario({ cutoff_inclusive = false } = {}) {
  const manifest = makeManifest({ deadline_policy: { cutoff_inclusive } });
  const frozen = freezeManifest(manifest, makeApproval(manifest));
  const opened = openInitialRound(frozen, {
    opened_at: "2026-09-02T11:00:00Z",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: manifest.buyer_authority_ref },
  });
  const closed = closeInitialRound(opened, {
    closed_at: "2026-09-10T18:00:00Z",
    observations: [
      makeStubObservation("supplier-a", "RESPONDED", "2026-09-09T10:00:00Z"),
      makeStubObservation("supplier-b", "RESPONDED", "2026-09-10T16:00:00Z"),
    ],
    origin: { kind: AUTHORITY.SYSTEM_DERIVED, reference: "clock-001" },
  });
  const final = openFinalRound(closed, frozen, {
    opened_at: "2026-09-10T19:00:00Z",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: manifest.buyer_authority_ref },
  });
  return { manifest, frozen, opened, closed, final };
}

export function buildPacketScenario() {
  const scenario = buildInitialScenario();
  return {
    ...scenario,
    common: compileCommonPacket(scenario.frozen, scenario.opened),
    packetA: compileSupplierPacket(scenario.frozen, scenario.opened, "supplier-a"),
    packetB: compileSupplierPacket(scenario.frozen, scenario.opened, "supplier-b"),
  };
}

export function scenarioDigestSummary() {
  const { frozen, opened, closed, final, common, packetA, packetB } = buildPacketScenario();
  return {
    manifest_digest: frozen.manifest_digest,
    initial_round_id: opened.round_id,
    initial_state_digest: closed.state_digest,
    eligibility_digest: closed.eligibility.eligibility_digest,
    final_round_id: final.round_id,
    final_state_digest: final.state_digest,
    common_core_digest: common.common_core_digest,
    packet_a_digest: packetA.packet_digest,
    packet_b_digest: packetB.packet_digest,
    packet_common_digests: [packetA.common_core_digest, packetB.common_core_digest],
    canonical_manifest_bytes: canonicalize(frozen.manifest),
    final_eligible_supplier_ids: final.eligibility.eligible_supplier_ids,
  };
}

export { ROUND_TYPES };
