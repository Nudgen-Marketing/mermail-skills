import assert from "node:assert/strict";
import test from "node:test";

import { buildEffectIntent } from "./effects/intent.mjs";
import { reconcileEffect } from "./effects/adapter.mjs";
import { reconcileAndRecord } from "./effects/gateway.mjs";
import { validateNormalizedObservation } from "./effects/observation.mjs";
import { FakeMermailAdapter } from "./effects/fake-adapter.mjs";
import { DirectMermailAdapter } from "./mcp/direct-mcp-adapter.mjs";
import { assertAdapterForMode } from "./competitive-round.mjs";
import { buildR7Fixture } from "../demo/fixtures/decision-fixtures.mjs";
import { classifyFinalSubmission, compileR7FinalRound, selectEffectiveRevisions } from "./decision/final-round.mjs";

function intent() {
  return buildEffectIntent({
    sourcing_id: "source-001", round_id: "round-001", current_state_digest: "a".repeat(64), evaluation_digest: null,
    effect_type: "SEND_EMAIL", mailbox_id: "buyer-mailbox", reply_source_mailbox_id: null, reply_source_email_id: null,
    reply_thread_id: null, expected_reply_target: null, to: "supplier@example.test", from: "buyer@example.test",
    subject: "RFQ", text: "Controlled test", html: null, attachments: [], purpose: "CONTROLLED_INTEGRATION_PROBE",
  });
}

test("normalized observations derive authority from type/state and reject boolean claims", () => {
  const current = intent();
  const adapter = new FakeMermailAdapter({ providerMessageId: "provider-1", recipientMailboxId: "supplier-mailbox" });
  const request = { mailboxId: current.mailbox_id, body: { from: current.from, to: current.to, subject: current.subject, text: current.text } };
  const observation = adapter.observation(request, { intent: current });
  assert.equal(validateNormalizedObservation(observation), true);
  assert.equal(reconcileEffect(current, [observation]).state, "OBSERVED_IN_RECIPIENT_MAILBOX");
  const provider = new FakeMermailAdapter({ observationType: "PROVIDER", deliveryStatus: "provider_delivered", providerMessageId: "provider-1" }).observation(request, { intent: current });
  const correlated = reconcileEffect(current, [provider, observation]);
  assert.equal(correlated.logical_effect_count, 1);
  assert.equal(correlated.state, "OBSERVED_IN_RECIPIENT_MAILBOX");
  const mismatch = new FakeMermailAdapter({ observationType: "PROVIDER", deliveryStatus: "provider_delivered", providerMessageId: "provider-2" }).observation(request, { intent: current });
  assert.equal(reconcileEffect(current, [provider, mismatch]).outcome, "MULTIPLE_MATCHING_EFFECTS");
  assert.throws(() => validateNormalizedObservation({ ...observation, provider_delivered: true }), /unknown field/i);
  assert.throws(() => reconcileEffect(current, [{ ...observation, recipient_mailbox_id: "fake-other" }]), /recipient observation/i);
});

test("gateway refuses arbitrary caller observations before touching durable state", async () => {
  await assert.rejects(
    reconcileAndRecord({ root: "unused", intent: intent(), observations: [] }),
    (error) => error.code === "RAW_OBSERVATIONS_FORBIDDEN",
  );
});

test("live selection rejects the controlled adapter and controlled mode requires its explicit boundary", () => {
  const adapter = new FakeMermailAdapter();
  assert.throws(() => assertAdapterForMode("live", adapter), /DirectMermailAdapter/i);
  assert.equal(assertAdapterForMode("controlled", adapter), true);
});

test("DirectMermailAdapter normalizes read results through the read-only observer boundary", async () => {
  const current = intent();
  const client = { async callTool({ name, arguments: args }) {
    assert.equal(name, "search_emails");
    return { structuredContent: { items: [{ id: args.mailboxId === "supplier-mailbox" ? "supplier-local" : "buyer-local", provider_message_id: "provider-1", from: current.from, to: current.to, subject: current.subject, text: current.text, delivery_status: "provider_delivered" }] } };
  } };
  const adapter = new DirectMermailAdapter({ client, recipientMailboxId: "supplier-mailbox" });
  const observations = await adapter.readObservations(current, { observedAt: "2026-09-05T12:00:00.000Z" });
  assert.equal(observations.length, 2);
  assert.equal(observations[0].provenance.adapter_class, "DirectMermailAdapter");
  assert.equal(observations[1].observation_type, "RECIPIENT_MAILBOX");
  assert.equal(observations[1].delivery_status, "received");
});

test("conflicting on-time final revisions have no effective commercial offer", () => {
  const fixture = buildR7Fixture();
  const finalRound = compileR7FinalRound({ frozenManifest: fixture.frozen, initialClosedState: fixture.closed, opened_at: "2026-09-10T19:00:00Z", policy: fixture.policy });
  const initial = fixture.offers[0];
  const first = fixture.makeOffer("supplier-a", { delivery: 4, price: 190 }, { roundId: fixture.finalRoundId, revisionKind: "FINAL", predecessorOfferDigest: initial.offer_digest, receivedAt: "2026-09-10T20:00:00Z" });
  const second = fixture.makeOffer("supplier-a", { delivery: 6, price: 195 }, { roundId: fixture.finalRoundId, revisionKind: "FINAL", predecessorOfferDigest: initial.offer_digest, receivedAt: "2026-09-10T20:01:00Z" });
  assert.equal(classifyFinalSubmission({ submission: first, finalRound, policy: fixture.policy, initialOfferDigest: initial.offer_digest }).status, "ACCEPTED_ON_TIME");
  const result = selectEffectiveRevisions({ initialOffers: fixture.offers, finalSubmissions: [first, second], finalRound, policy: fixture.policy });
  assert.deepEqual(result.conflicted_supplier_ids, ["supplier-a"]);
  assert.equal(result.effective_offers.some((offer) => offer.supplier_id === "supplier-a"), false);
  const identical = selectEffectiveRevisions({ initialOffers: fixture.offers, finalSubmissions: [first, first], finalRound, policy: fixture.policy });
  assert.deepEqual(identical.conflicted_supplier_ids, ["supplier-a"]);
  assert.equal(identical.effective_offers.some((offer) => offer.supplier_id === "supplier-a"), false);
});
