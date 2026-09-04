import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { verifyJournal } from "./runtime/durability/verifier.mjs";
import { readOnlyState } from "./runtime/durability/journal.mjs";
import { buildR5Fixture } from "./demo/fixtures/lane-fixtures.mjs";
import { validateDeclassifiedOutput, outputContainsAny } from "./runtime/worker/declassifier.mjs";
import { validateRecipientEvidence, validateRecipientObservation } from "./runtime/evidence/recipient-evidence.mjs";
import { buildDecisionPolicy } from "./runtime/decision/schema.mjs";
import { buildEvaluationArtifact, verifyEvaluationArtifact } from "./runtime/decision/artifact.mjs";
import { buildR7Fixture } from "./demo/fixtures/decision-fixtures.mjs";
import { evaluateRound } from "./runtime/decision/evaluator.mjs";
import { verifyBundle } from "./runtime/effects/ledger.mjs";
import { sha256Canonical } from "./runtime/effects/core.mjs";
import { canonicalMutation, validateApprovalRecord, validateEffectIntent } from "./runtime/effects/intent.mjs";

const CANARIES = ["B_PRIVATE_DO_NOT_LEAK_R9", "BUYER_RESERVE_PRIVATE_R9", "R9_EFFECT_CANARY", "send_email", "reply_to_email"];

function reserveConstraints() {
  return [
    { field_id: "delivery-days", operator: "LTE", value: { integer: 14 }, unit: "day", currency: null },
    { field_id: "total-price", operator: "LTE", value: { minor_units: 300, currency: "USD" }, unit: "minor", currency: "USD" },
  ];
}

async function runFresh(script, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function add(checks, name, ok, detail = null) { checks.push({ name, ok: Boolean(ok), detail }); }

async function readJson(path) { return JSON.parse(await fs.readFile(path, "utf8")); }

export async function verifyAuthoritativeBundleObject(root, bundle) {
  const checks = [];
  try {
    const r6Root = join(root, "durable");
    const r6 = await verifyJournal(r6Root, { sourcing_id: bundle.manifest.manifest.sourcing_id });
    add(checks, "R6 journal is current and verified read-only", r6.outcome === "VALID_CURRENT_HEAD", r6.outcome);
    const r6State = (await readOnlyState(r6Root, { sourcing_id: bundle.manifest.manifest.sourcing_id })).state;
    add(checks, "R6 state digest matches authoritative bundle", r6State.state_digest === bundle.r6.state.state_digest, { actual: r6State.state_digest, expected: bundle.r6.state.state_digest });

    const r5 = buildR5Fixture();
    const hostile = bundle.r5.hostile_lane;
    validateDeclassifiedOutput(hostile.trusted);
    add(checks, "hostile lane is assigned to Supplier A", hostile.trusted.supplier_id === "supplier-a", hostile.trusted.supplier_id);
    add(checks, "hostile lane trusted output is rejected", hostile.trusted.worker_output_state === "REJECTED", hostile.trusted.worker_output_state);
    add(checks, "forbidden canaries are absent from trusted output", outputContainsAny(hostile.trusted, CANARIES).length === 0, outputContainsAny(hostile.trusted, CANARIES));

    const source = bundle.source_evidence;
    let sourceValid = false;
    try {
      validateRecipientObservation(source.observation);
      validateRecipientEvidence(source.record);
      const receipt = source.observation.source_snapshot;
      sourceValid = source.verification_state === "VERIFIED"
        && source.record.verification_state === "VERIFIED"
        && source.record.receipt_snapshot_digest === receipt.source_snapshot_digest
        && source.record.buyer_mailbox_id === receipt.mailbox_id
        && source.record.buyer_email_id === receipt.email_id
        && source.record.raw_source_fragment === "30 days"
        && source.record.field_name === "delivery_days"
        && source.record.normalized_value?.days === 30
        && source.record.source_span?.content_hash === receipt.content_hash
        && receipt.content.current_text.slice(source.record.source_span.start, source.record.source_span.end) === source.record.raw_source_fragment;
    } catch {
      sourceValid = false;
    }
    add(checks, "exact Buyer-receipt source/span evidence is verified", sourceValid, sourceValid ? null : "source evidence invalid or tampered");

    const liveR8 = bundle.live_r8;
    add(checks, "accepted live R8 proof is explicitly typed and single-attempt", liveR8?.evidence_class === "LIVE EFFECT PROOF FROM ACCEPTED R8 BOUNDED RUN" && liveR8?.direct_mcp === true && liveR8?.dispatch_count === 1 && liveR8?.result?.status === "queued" && liveR8?.result?.classification === "MUTATION_ACCEPTED", liveR8);
    add(checks, "accepted live R8 proof preserves no-retry and one logical effect", liveR8?.first_reconciliation?.retry === false && liveR8?.final_reconciliation?.outcome === "ONE_LOGICAL_EFFECT_OBSERVED" && liveR8?.final_reconciliation?.logical_effect_count === 1, liveR8?.final_reconciliation);
    add(checks, "accepted live R8 mailbox copies correlate without merging local IDs", liveR8?.buyer_observation?.local_email_id !== liveR8?.supplier_observation?.local_email_id && liveR8?.buyer_observation?.provider_message_id === liveR8?.supplier_observation?.provider_message_id, { buyer: liveR8?.buyer_observation, supplier: liveR8?.supplier_observation });

    const r7 = buildR7Fixture();
    const policy = buildDecisionPolicy({ frozen_manifest: r7.frozen, reserve_constraints: reserveConstraints() });
    const built = [
      r7.makeOfferWithEvidence("supplier-a", { delivery: 20, price: 180 }),
      r7.makeOfferWithEvidence("supplier-b", { delivery: 5, price: 250 }),
      r7.makeOfferWithEvidence("supplier-c", { delivery: 7, price: 200 }),
    ];
    const offers = built.map(({ offer }) => offer);
    const evidence = built.flatMap(({ evidenceRecords }) => evidenceRecords);
    const expectedFrontier = evaluateRound({ policy, offers, evidenceRecords: evidence, eligibleSupplierIds: r7.eligibleSupplierIds, roundId: r7.initialRoundId });
    const evalCheck = verifyEvaluationArtifact(bundle.r7.evaluation, { policy, eligibleSupplierIds: r7.eligibleSupplierIds, offers, evidenceRecords: evidence, r6_state_digest: r6State.state_digest, r6_head_event_digest: r6State.journal.head_event_digest, round_state_digest: r7.closed.state_digest });
    add(checks, "R7 evaluation artifact replays from trusted inputs", evalCheck.valid, evalCheck);
    add(checks, "R7 evaluation is the recorded frontier decision", bundle.r7.evaluation.decision.result_digest === expectedFrontier.result_digest && expectedFrontier.outcome === "PARETO_FRONTIER", expectedFrontier.outcome);
    add(checks, "hard-fail branch remains visible", bundle.r7.decisions.hard_fail.supplier_dispositions.some((item) => item.status === "HARD_CONSTRAINT_FAIL"), bundle.r7.decisions.hard_fail.outcome);
    add(checks, "reserve branch produces genuine NO_DEAL", bundle.r7.decisions.no_deal.outcome === "NO_DEAL", bundle.r7.decisions.no_deal.outcome);
    add(checks, "late final revision is preserved and ineligible", bundle.r7.decisions.final_revision.late_classification.status === "LATE_PRESERVED", bundle.r7.decisions.final_revision.late_classification);

    const effectRoot = join(root, "effect");
    const r8 = await verifyBundle(effectRoot, { sourcing_id: bundle.r8.intent.sourcing_id });
    add(checks, "R8 effect ledger is current and verified read-only", r8.valid && r8.checkpoint_status === "CURRENT", r8);
    const r8State = (await readJson(join(effectRoot, "effects.head.json"))).expected_state_digest;
    const effectBundle = (await import("./runtime/effects/ledger.mjs")).readBundle;
    const effect = (await effectBundle(effectRoot, { sourcing_id: bundle.r8.intent.sourcing_id })).state.effects[bundle.r8.intent.effect_id];
    validateEffectIntent(bundle.r8.intent);
    validateApprovalRecord(bundle.r8.approval, bundle.r8.candidate, bundle.r8.intent, bundle.r8.preview);
    add(checks, "R8 request is the canonical approved request", JSON.stringify(bundle.r8.request) === JSON.stringify(canonicalMutation(bundle.r8.intent)), "request binding");
    add(checks, "R8 approval binds the recorded candidate", bundle.r8.approval.approval_candidate_id === bundle.r8.candidate.approval_candidate_id, bundle.r8.approval.approval_candidate_id);
    add(checks, "R8 approval mismatch blocks mutated integrated request", bundle.r8.driftBlocked?.blocked === true && bundle.r8.driftBlocked.code, bundle.r8.driftBlocked);
    add(checks, "R8 has one reservation and one attempt", effect.reservation_count === 1 && effect.attempt_count === 1, { reservation_count: effect.reservation_count, attempt_count: effect.attempt_count });
    add(checks, "R8 terminal classification is mutation accepted", effect.terminal_result?.state === "MUTATION_ACCEPTED", effect.terminal_result);
    add(checks, "R8 state records one logical reconciliation observation", effect.observations.length === 1 && effect.observations[0].logical_effect_count === 1, effect.observations);
    add(checks, "R8 fresh replay has no adapter authority", bundle.r8.replay.adapter_called === false && bundle.r8.adapter_calls === 1, { replay: bundle.r8.replay, adapter_calls: bundle.r8.adapter_calls });
    add(checks, "presentation is not an authority input", true, "presentation.json is intentionally not read");
    add(checks, "R8 checkpoint state is bound", r8State === bundle.r8.fresh.parsed.verification.state_digest, { checkpoint: r8State, fresh: bundle.r8.fresh.parsed.verification.state_digest });
  } catch (error) {
    add(checks, "independent verifier completed without exception", false, { code: error.code, message: error.message });
  }
  return Object.freeze({ valid: checks.every((item) => item.ok), checks, read_only: true, authority: "INDEPENDENT_READ_ONLY_VERIFIER" });
}

export async function verifyBundleAt(root) {
  const bundle = await readJson(join(root, "authoritative-bundle.json"));
  return verifyAuthoritativeBundleObject(root, bundle);
}

if (process.argv[1] && (process.argv[1].toLowerCase().endsWith("r9-independent-verifier.mjs") || process.argv[1].toLowerCase().endsWith("verify.mjs"))) {
  const root = resolve(process.argv[2]);
  const result = await verifyBundleAt(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
