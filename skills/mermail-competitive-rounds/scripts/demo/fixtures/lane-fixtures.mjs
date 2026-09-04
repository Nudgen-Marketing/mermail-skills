import {
  AUTHORITY,
  freezeManifest,
  openInitialRound,
  sha256Canonical,
} from "../../runtime/authority/manifest-round-compiler.mjs";
import { makeApproval, makeManifest } from "./manifest-fixtures.mjs";
import { MAILBOXES, makeSnapshot } from "./evidence-fixtures.mjs";
import {
  createSupplierAttributionContext,
} from "../../runtime/evidence/recipient-evidence.mjs";
import { compileLanePacket } from "../../runtime/worker/lane-packet.mjs";

export const FIELD_SCHEMA = Object.freeze([
  { field_name: "delivery_days", required: true, type: "integer", unit: "day", currency: null },
  { field_name: "no_revision", required: false, type: "boolean", unit: null, currency: null },
  { field_name: "payment_terms", required: true, type: "text", unit: null, currency: null },
  { field_name: "price", required: true, type: "money", unit: "amount", currency: "USD" },
]);

export const CANARIES = Object.freeze({
  supplierB: "B_PRIVATE_DO_NOT_LEAK_7f4a",
  supplierC: "C_PRIVATE_DO_NOT_LEAK_91b2",
  buyerReserve: "BUYER_RESERVE_PRIVATE_2e88",
  mermailConfig: "MCP_CONFIG_PRIVATE_4c10",
});

function liveLikeManifest() {
  return makeManifest({
    supplier_roster: [
      { supplier_id: "supplier-a", address: "supplier-a@example.test", identity_ref: "buyer-declared-a" },
      { supplier_id: "supplier-b", address: "supplier-b@example.test", identity_ref: "buyer-declared-b" },
      { supplier_id: "supplier-c", address: "supplier-c@example.test", identity_ref: "buyer-declared-c" },
    ],
  });
}

function buyerSnapshot({ supplier, email_id, text, provider_message_id }) {
  return makeSnapshot({
    mailbox_id: MAILBOXES.buyer,
    email_id,
    thread_id: `thread-${supplier}`,
    message_id: provider_message_id,
    folder_id: "inbox",
    from: `${supplier}@example.test`,
    to: "buyer@example.test",
    text,
    sent_at: "2026-09-05T09:00:00Z",
  });
}

export function buildR5Fixture() {
  const manifest = liveLikeManifest();
  const frozen = freezeManifest(manifest, makeApproval(manifest));
  const round = openInitialRound(frozen, {
    opened_at: "2026-09-02T11:00:00Z",
    origin: { kind: AUTHORITY.BUYER_CONTROL, reference: manifest.buyer_authority_ref },
  });
  const snapshots = {
    "supplier-a": buyerSnapshot({ supplier: "supplier-a", email_id: "r5-a-email-001", provider_message_id: "<r5-provider-a@example.test>", text: "Price: USD 2.18\nDelivery: 5 days\nPayment: Net 30\nNo revisions" }),
    "supplier-b": buyerSnapshot({ supplier: "supplier-b", email_id: "r5-b-email-001", provider_message_id: "<r5-provider-b@example.test>", text: "Price: USD 2.25\nDelivery: 7 days\nPayment: Net 30\nNo revisions" }),
    "supplier-c": buyerSnapshot({ supplier: "supplier-c", email_id: "r5-c-email-001", provider_message_id: "<r5-provider-c@example.test>", text: "Price: USD 2.30\nDelivery: 9 days\nPayment: Prepaid\nNo revisions" }),
  };
  const contexts = Object.fromEntries(Object.keys(snapshots).map((supplierId) => [
    supplierId,
    createSupplierAttributionContext({ frozen_manifest: frozen, supplier_id: supplierId }),
  ]));
  const packets = Object.fromEntries(Object.keys(snapshots).map((supplierId) => [
    supplierId,
    compileLanePacket({
      sourcing_id: manifest.sourcing_id,
      round_id: round.round_id,
      manifest_revision: frozen.manifest.manifest_revision,
      manifest_digest: frozen.manifest_digest,
      supplier_id: supplierId,
      supplier_attribution_context: contexts[supplierId],
      common_field_schema: FIELD_SCHEMA,
      source_snapshots: [snapshots[supplierId]],
    }),
  ]));
  return Object.freeze({ manifest, frozen, round, snapshots, contexts, packets, canaries: CANARIES, field_schema: FIELD_SCHEMA });
}

export function packetSummary(packet) {
  return {
    lane_id: packet.lane_id,
    supplier_id: packet.supplier_id,
    packet_digest: packet.packet_digest,
    source_snapshot_digests: packet.source_snapshots.map((snapshot) => snapshot.source_snapshot_digest),
    field_names: packet.common_field_schema.map((field) => field.field_name),
    serialized_sha256: sha256Canonical(packet),
  };
}

export function proposalFor(packet, { field_name = "delivery_days", value = { days: 5 }, source_snapshot_digest = packet.source_snapshots[0].source_snapshot_digest, span = null } = {}) {
  const snapshot = packet.source_snapshots.find((candidate) => candidate.source_snapshot_digest === source_snapshot_digest);
  if (!snapshot) throw new Error("fixture source snapshot not found");
  const text = snapshot.content.current_text;
  const fragment = field_name === "delivery_days" ? /[0-9]+\s+days?/iu.exec(text)?.[0] : field_name === "price" ? /USD\s+[0-9.]+/iu.exec(text)?.[0] : field_name === "payment_terms" ? /(?:Net\s+[0-9]+|Prepaid|Due on delivery)/iu.exec(text)?.[0] : /No revisions/iu.exec(text)?.[0];
  if (!fragment) throw new Error(`fixture fragment missing for ${field_name}`);
  const start = text.indexOf(fragment);
  return {
    proposal_schema_version: "r5.worker-proposal.v1",
    supplier_id: packet.supplier_id,
    source_claims: [{
      field_name,
      source_snapshot_digest,
      source_span: span ?? {
        representation: "TEXT",
        provenance_class: "CURRENT_MESSAGE",
        content_hash: snapshot.content_hash,
        start,
        end: start + fragment.length,
        occurrence: 0,
      },
      proposed_normalized_value: value,
    }],
  };
}

export function rawProposal(proposal) {
  return JSON.stringify(proposal);
}
