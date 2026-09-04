import { buildR6Scenario } from "./durable-fixtures.mjs";
import { buildDecisionPolicy, buildEvidenceRecord, buildEvidenceRef, buildOffer } from "../../runtime/decision/schema.mjs";
import { clone, sha256Canonical } from "../../runtime/decision/core.mjs";

function sourceFor(supplierId, fieldId, text, index, roundId) {
  return {
    evidence_id: `r7-evidence-${supplierId}-${fieldId}`,
    field_id: fieldId,
    supplier_id: supplierId,
    sourcing_id: "source-001",
    round_id: roundId,
    manifest_revision: 1,
    manifest_digest: null,
    receipt_snapshot_digest: sha256Canonical({ supplierId, text, mailbox: "buyer-mailbox-controlled" }),
    buyer_mailbox_id: "buyer-mailbox-controlled",
    buyer_email_id: `buyer-email-${supplierId}`,
    provider_message_id: `provider-${supplierId}`,
    source_span: { start: index, end: index + text.length, occurrence: 0, content_hash: sha256Canonical(text) },
    raw_fragment: text,
    normalized_value: null,
    unit: null,
    currency: null,
    verification_state: "VERIFIED",
  };
}

export function buildR7Fixture() {
  const r6 = buildR6Scenario();
  const frozen = r6.frozen;
  const initial = r6.round;
  const closed = r6.closed;
  const manifestDigest = frozen.manifest_digest;
  const reserve = [
    { field_id: "delivery-days", operator: "LTE", value: { integer: 14 }, unit: "day", currency: null },
    { field_id: "total-price", operator: "LTE", value: { minor_units: 210, currency: "USD" }, unit: "minor", currency: "USD" },
  ];
  const policy = buildDecisionPolicy({ frozen_manifest: frozen, reserve_constraints: reserve });
  const eligibleSupplierIds = [...closed.eligibility.eligible_supplier_ids].sort();
  const suppliers = ["supplier-a", "supplier-b", "supplier-c"].filter((id) => frozen.manifest.supplier_roster.some((entry) => entry.supplier_id === id));
  const values = {
    "supplier-a": { delivery: 5, price: 218 },
    "supplier-b": { delivery: 7, price: 225 },
    "supplier-c": { delivery: 9, price: 230 },
  };
  const evidence = [];
  const bySupplier = {};
  for (const supplierId of suppliers) {
    const v = values[supplierId];
    const deliveryText = `Delivery: ${v.delivery} days`;
    const priceText = `Total price: USD ${(v.price / 100).toFixed(2)}`;
    const delivery = sourceFor(supplierId, "delivery-days", deliveryText, 0, initial.round_id);
    const price = sourceFor(supplierId, "total-price", priceText, 20, initial.round_id);
    delivery.manifest_digest = manifestDigest;
    delivery.normalized_value = { integer: v.delivery };
    delivery.unit = "day";
    price.manifest_digest = manifestDigest;
    price.normalized_value = { minor_units: v.price, currency: "USD" };
    price.unit = "minor";
    price.currency = "USD";
    const records = [buildEvidenceRecord(delivery), buildEvidenceRecord(price)];
    evidence.push(...records);
    bySupplier[supplierId] = records;
  }
  const roundEvidenceCache = new Map([[initial.round_id, evidence]]);
  const evidenceForRound = (roundId) => {
    if (roundEvidenceCache.has(roundId)) return roundEvidenceCache.get(roundId);
    const derived = evidence.map((record) => buildEvidenceRecord({
      ...record,
      evidence_id: `${record.evidence_id}-${roundId}`,
      round_id: roundId,
      record_digest: null,
    }));
    roundEvidenceCache.set(roundId, derived);
    return derived;
  };
  const recordsFor = (supplierId, roundId) => {
    const all = evidenceForRound(roundId);
    return all.filter((record) => record.supplier_id === supplierId);
  };
  const recordsForValues = (supplierId, roundId, valuesOverride) => {
    const baseRecords = recordsFor(supplierId, roundId);
    const base = values[supplierId];
    return baseRecords.map((record) => {
      const next = record.field_id === "delivery-days" ? valuesOverride.delivery : record.field_id === "total-price" ? valuesOverride.price : undefined;
      const original = record.field_id === "delivery-days" ? base.delivery : record.field_id === "total-price" ? base.price : undefined;
      if (next === undefined || next === null || next === original) return record;
      const normalized = record.field_id === "delivery-days" ? { integer: next } : { minor_units: next, currency: "USD" };
      const raw = record.field_id === "delivery-days" ? `Delivery: ${next} days` : `Total price: USD ${(next / 100).toFixed(2)}`;
      return buildEvidenceRecord({ ...record, evidence_id: `${record.evidence_id}-variant-${String(next)}`, normalized_value: normalized, raw_fragment: raw, source_span: { ...record.source_span, end: record.source_span.start + raw.length, content_hash: sha256Canonical(raw) }, record_digest: null });
    });
  };
  const makeFields = (supplierId, roundId, revisionKind = "INITIAL", valuesOverride = {}, records = recordsForValues(supplierId, roundId, valuesOverride)) => {
    const deliveryRecord = records.find((record) => record.field_id === "delivery-days");
    const priceRecord = records.find((record) => record.field_id === "total-price");
    const deliveryValue = valuesOverride.delivery ?? values[supplierId].delivery;
    const priceValue = valuesOverride.price ?? values[supplierId].price;
    const delivery = deliveryValue === null ? { status: "UNKNOWN", value: null, unit: null, currency: null, evidence_ref: null } : { status: "VERIFIED", value: { integer: deliveryValue }, unit: "day", currency: null, evidence_ref: buildEvidenceRef(deliveryRecord) };
    const price = priceValue === null ? { status: "UNKNOWN", value: null, unit: null, currency: null, evidence_ref: null } : { status: "VERIFIED", value: { minor_units: priceValue, currency: "USD" }, unit: "minor", currency: "USD", evidence_ref: buildEvidenceRef(priceRecord) };
    return { "delivery-days": delivery, "total-price": price };
  };
  const make = (supplierId, valuesOverride = {}, options = {}) => buildOffer({
    supplier_id: supplierId,
    sourcing_id: frozen.manifest.sourcing_id,
    round_id: options.roundId ?? initial.round_id,
    manifest_revision: frozen.manifest.manifest_revision,
    manifest_digest: manifestDigest,
    revision_kind: options.revisionKind ?? "INITIAL",
    predecessor_offer_digest: options.predecessorOfferDigest ?? null,
    received_at: options.receivedAt ?? "2026-09-09T10:00:00Z",
    eligibility_state: options.eligibilityState ?? "ELIGIBLE",
    fields: makeFields(supplierId, options.roundId ?? initial.round_id, options.revisionKind ?? "INITIAL", valuesOverride),
  }, policy);
  const makeWithEvidence = (supplierId, valuesOverride = {}, options = {}) => {
    const roundId = options.roundId ?? initial.round_id;
    const records = recordsForValues(supplierId, roundId, valuesOverride);
    const offer = buildOffer({
      supplier_id: supplierId,
      sourcing_id: frozen.manifest.sourcing_id,
      round_id: roundId,
      manifest_revision: frozen.manifest.manifest_revision,
      manifest_digest: manifestDigest,
      revision_kind: options.revisionKind ?? "INITIAL",
      predecessor_offer_digest: options.predecessorOfferDigest ?? null,
      received_at: options.receivedAt ?? "2026-09-09T10:00:00Z",
      eligibility_state: options.eligibilityState ?? "ELIGIBLE",
      fields: makeFields(supplierId, roundId, options.revisionKind ?? "INITIAL", valuesOverride, records),
    }, policy);
    return { offer, evidenceRecords: records };
  };
  const offers = suppliers.map((supplierId) => make(supplierId));
  return Object.freeze({ r6, frozen, initial, closed, final: r6.final, policy, eligibleSupplierIds, initialRoundId: initial.round_id, finalRoundId: r6.final.round_id, evidence, evidenceBySupplier: bySupplier, evidenceForRound, offers, makeOffer: make, makeOfferWithEvidence: makeWithEvidence, values, r6_binding: { r6_state_digest: "d1027fcdb607fc208f1ae2605558d28ecaa4b62f94798c2448d96aa60cdf9873", r6_head_event_digest: "647992e0f89d92737a4f031aaf58355b3890cfc50a3a9c00b29c26f4224e1da8" } });
}

export function makeSyntheticOfferSet(fixture, valuesBySupplier, options = {}) {
  return Object.entries(valuesBySupplier).map(([supplierId, values]) => fixture.makeOffer(supplierId, values, options));
}

export function cloneWith(value, patch) {
  return { ...clone(value), ...patch };
}
