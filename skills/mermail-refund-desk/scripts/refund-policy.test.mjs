#!/usr/bin/env node
/**
 * mermail-refund-desk / refund-policy tests
 *
 * Run:  node --test skills/mermail-refund-desk/scripts/refund-policy.test.mjs
 *
 * Coverage note (honest split): this suite covers every decision the deterministic core owns —
 * happy path, malformed input, identity, duplicate detection, idempotency, caps, allowlists,
 * untrusted-input signals, plus the structural payout-binding invariant and CLI behaviour.
 * Transport-level failures (missing credentials, unavailable mailbox, MCP 401/403/429, write
 * timeout/5xx, user cancellation mid-run) are not decidable offline and are covered by the
 * workflow harness and the live integration run documented in TEST_RESULTS.md.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { evaluateClaim } from "./refund-policy.mjs";

const run = promisify(execFile);
const here = import.meta.dirname;
const examples = path.join(here, "examples");
const engine = path.join(here, "refund-policy.mjs");

const readJson = async (name) => JSON.parse(await readFile(path.join(examples, name), "utf8"));

const policy = await readJson("policy.json");
const ledger = await readJson("ledger.json");
const happyClaim = await readJson("claim-1042.json");
const redirectClaim = await readJson("claim-1042-redirect.json");

const LEDGER_DESTINATION = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const claimFor = (orderRef, overrides = {}) => ({
  order_ref: orderRef,
  from_email: ledger.orders.find((o) => o.order_ref === orderRef).customer_email,
  ...overrides,
});

// ---------------------------------------------------------------- happy path
test("happy path: verified duplicate inside policy is eligible, paid from the ledger", () => {
  const result = evaluateClaim(happyClaim, ledger, policy);
  assert.equal(result.disposition, "eligible");
  assert.equal(result.reason_code, "duplicate_confirmed_eligible");
  assert.equal(result.order_ref, "1042");
  assert.deepEqual(result.verified.charge_ids, ["ch_1042a", "ch_1042b"]);
  assert.equal(result.verified.duplicate_amount, 29.0);
  assert.equal(result.payout.amount, 29.0);
  assert.equal(result.payout.asset, "USDC");
  assert.equal(result.payout.chain, "solana");
  assert.equal(result.payout.destination, LEDGER_DESTINATION);
  assert.equal(result.payout.destination_source, "ledger");
  assert.equal(result.next_action, "owner_approval");
  assert.equal(result.policy_version, policy.policy_version);
  assert.equal(result.ledger_revision, "rev-7");
});

// ------------------------------------------------- the central invariant
test("INVARIANT: a claim-supplied destination is never used, even when nothing is flagged", () => {
  const claim = claimFor("1042", { claimed_destination: "Attacker111111111111111111111111111111111111" });
  const result = evaluateClaim(claim, ledger, policy);
  assert.equal(result.disposition, "eligible");
  assert.equal(result.payout.destination, LEDGER_DESTINATION);
  assert.notEqual(result.payout.destination, claim.claimed_destination);
  assert.equal(result.payout.destination_source, "ledger");
});

test("INVARIANT: every payout emitted by any fixture is byte-identical to the ledger payout", () => {
  const orders = ledger.orders.map((order) => claimFor(order.order_ref));
  for (const claim of orders) {
    const result = evaluateClaim(claim, ledger, policy);
    if (result.payout) {
      const entry = ledger.orders.find((order) => order.order_ref === claim.order_ref);
      assert.equal(result.payout.destination, entry.payout.destination);
      assert.equal(result.payout.amount, entry.payout.amount);
      assert.equal(result.payout.asset, entry.payout.asset);
      assert.equal(result.payout.chain, entry.payout.chain);
    }
    // no claim ever carries a payout into an ineligible disposition
    if (result.disposition !== "eligible") assert.equal(result.payout, undefined);
  }
});

test("payout object exposes only ledger-derived amount/asset/chain/destination", () => {
  const result = evaluateClaim(happyClaim, ledger, policy);
  assert.deepEqual(Object.keys(result.payout).sort(), [
    "amount", "asset", "chain", "destination", "destination_source",
  ]);
});

// ------------------------------------------------------- untrusted-input path
test("redirect attempt: held, and the reported destination is still the ledger's", () => {
  const result = evaluateClaim(redirectClaim, ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "modification_attempt_detected");
  assert.equal(result.payout, undefined);
  assert.equal(result.ledger_destination, LEDGER_DESTINATION);
  assert.equal(result.ignored_claim_destination, redirectClaim.claimed_destination);
  assert.ok(result.flags.includes("claim_attempted_to_change_payout_terms"));
  assert.equal(result.next_action, "ask_owner");
});

test("redirect attempt respects hold_on_modification_attempt=false but still pays the ledger", () => {
  const lenient = { ...policy, hold_on_modification_attempt: false };
  const result = evaluateClaim(redirectClaim, ledger, lenient);
  assert.equal(result.disposition, "eligible");
  assert.equal(result.payout.destination, LEDGER_DESTINATION);
  assert.ok(result.flags.includes("claim_attempted_to_change_payout_terms"));
});

// ---------------------------------------------------------- duplicate detection
test("not a duplicate: one settled charge is rejected with a reply path", () => {
  const result = evaluateClaim(claimFor("1043"), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "duplicate_not_confirmed");
  assert.equal(result.next_action, "reply");
  assert.equal(result.payout, undefined);
});

test("idempotency: an already-refunded order is rejected and never paid twice", () => {
  const result = evaluateClaim(claimFor("1044"), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "already_refunded");
  assert.ok(result.flags.includes("prior_refund_recorded"));
});

test("run-level idempotency: a second message for an already-granted order is refused in the same run", () => {
  // Mermail keeps the sent record and the delivered inbound copy, so one complaint can appear twice.
  const first = evaluateClaim(happyClaim, ledger, policy, { alreadyHandled: [] });
  assert.equal(first.disposition, "eligible");
  const second = evaluateClaim(happyClaim, ledger, policy, { alreadyHandled: ["1042"] });
  assert.equal(second.disposition, "rejected");
  assert.equal(second.reason_code, "duplicate_claim_in_run");
  assert.equal(second.payout, undefined);
  assert.ok(second.flags.includes("same_order_already_granted_this_run"));
});

test("run-level idempotency is scoped to the listed orders only", () => {
  const result = evaluateClaim(claimFor("1042"), ledger, policy, { alreadyHandled: ["1043", "1044"] });
  assert.equal(result.disposition, "eligible");
});

test("SECURITY ORDERING: a redirect attempt is never masked by run-level dedupe", () => {
  // An order already granted this run, whose second message tries to redirect the payout:
  // the attempt must still be surfaced as modification_attempt_detected, not hidden as a duplicate.
  const result = evaluateClaim(redirectClaim, ledger, policy, { alreadyHandled: ["1042"] });
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "modification_attempt_detected");
  assert.equal(result.payout, undefined);
  assert.equal(result.ledger_destination, LEDGER_DESTINATION);
});

test("run-level idempotency tolerates whitespace and non-string entries", () => {
  const result = evaluateClaim(claimFor("1042"), ledger, policy, { alreadyHandled: [" 1042 ", null, 1043] });
  assert.equal(result.reason_code, "duplicate_claim_in_run");
});

test("a pending charge is not settlement: held, not refunded", () => {
  const result = evaluateClaim(claimFor("1045"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "unsettled_charge_present");
});

test("three settled charges need a human, not an automatic refund", () => {
  const result = evaluateClaim(claimFor("1046"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "manual_review_multiple_charges");
  assert.equal(result.verified.settled_count, 3);
});

test("two settled charges with different amounts need a human", () => {
  const result = evaluateClaim(claimFor("1049"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "manual_review_amount_mismatch");
  assert.deepEqual(result.verified.amounts, [29.0, 39.0]);
});

// ------------------------------------------------------------ caps + allowlists
test("ledger payout above the per-claim cap is held", () => {
  const result = evaluateClaim(claimFor("1047"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "over_policy_cap");
  assert.equal(result.attempted_payout.amount, 80.0);
});

test("ledger payout above the verified duplicate amount is held", () => {
  const generousCap = { ...policy, max_refund_per_claim: 500 };
  const result = evaluateClaim(claimFor("1047"), ledger, generousCap);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "amount_above_verified_duplicate");
});

test("ledger with no payout block is held: no authorized destination exists", () => {
  const result = evaluateClaim(claimFor("1048"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "no_authorized_destination");
  assert.equal(result.payout, undefined);
});

test("asset outside the policy allowlist is held", () => {
  const result = evaluateClaim(claimFor("1050"), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "asset_or_chain_not_allowed");
});

test("run cap stops further payouts in the same run", () => {
  const result = evaluateClaim(claimFor("1042"), ledger, policy, { paidThisRun: 5 });
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "run_cap_reached");
});

// --------------------------------------------------------------------- identity
test("identity: a sender who is neither the ledger customer nor on a trusted domain is rejected", () => {
  const result = evaluateClaim(claimFor("1042", { from_email: "someone.else@other.test" }), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "identity_mismatch");
  assert.equal(result.payout, undefined);
});

test("identity: domain trust is off by default - a same-domain imposter is rejected without allowed_customer_domains", () => {
  const exactOnly = { ...policy, allowed_customer_domains: [] };
  const result = evaluateClaim(claimFor("1042", { from_email: "someone.else@example.com" }), ledger, exactOnly);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "identity_mismatch");
});

test("identity: a forged display-name-style address on another registrable domain is rejected", () => {
  const result = evaluateClaim(claimFor("1042", { from_email: "jamie.lee@example.com.evil.test" }), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "identity_mismatch");
});

test("identity: a lookalike domain is rejected (dot-boundary match, not substring)", () => {
  const result = evaluateClaim(claimFor("1042", { from_email: "eve@evil-example.com" }), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "identity_mismatch");
});

test("identity: an allowlisted colleague address is accepted and flagged as such", () => {
  const result = evaluateClaim(claimFor("1042", { from_email: "support@example.com" }), ledger, policy);
  assert.equal(result.disposition, "eligible");
  assert.ok(result.flags.includes("identity_via_allowed_domain"));
});

test("identity: a malformed sender address is invalid input, never eligible", () => {
  const result = evaluateClaim(claimFor("1042", { from_email: "not-an-address" }), ledger, policy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "invalid_input");
});

// --------------------------------------------------------------- malformed input
test("invalid input: a non-object claim is rejected as invalid_input", () => {
  assert.equal(evaluateClaim("nope", ledger, policy).reason_code, "invalid_input");
  assert.equal(evaluateClaim(null, ledger, policy).reason_code, "invalid_input");
  assert.equal(evaluateClaim([], ledger, policy).reason_code, "invalid_input");
});

test("invalid input: malformed ledger or policy is rejected as invalid_input", () => {
  assert.equal(evaluateClaim(happyClaim, { orders: "no" }, policy).reason_code, "invalid_input");
  assert.equal(evaluateClaim(happyClaim, null, policy).reason_code, "invalid_input");
  assert.equal(evaluateClaim(happyClaim, ledger, { ...policy, max_refund_per_claim: "fifty" }).reason_code, "invalid_input");
  assert.equal(evaluateClaim(happyClaim, ledger, { ...policy, max_refunds_per_run: 0 }).reason_code, "invalid_input");
  assert.equal(evaluateClaim(happyClaim, ledger, { ...policy, currency_unit: "" }).reason_code, "invalid_input");
});

test("malformed message: no order reference is held, not guessed", () => {
  const result = evaluateClaim({ from_email: "jamie.lee@example.com" }, ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "unresolvable_order_reference");
});

test("malformed message: an order reference absent from the ledger is held", () => {
  const result = evaluateClaim(claimFor("1042", { order_ref: "999999" }), ledger, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "order_not_in_ledger");
});

test("order with no charges in the ledger is held", () => {
  const empty = { ledger_revision: "rev-x", orders: [{ order_ref: "1042", customer_email: "jamie.lee@example.com", charges: [] }] };
  const result = evaluateClaim(happyClaim, empty, policy);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "order_not_in_ledger");
});

// ------------------------------------------------------------ claimed-amount handling
test("claimed amount mismatch is held when the policy holds on mismatch", () => {
  const strict = { ...policy, hold_on_claim_amount_mismatch: true };
  const result = evaluateClaim(claimFor("1042", { claimed_amount: 250.0 }), ledger, strict);
  assert.equal(result.disposition, "needs_human");
  assert.equal(result.reason_code, "claim_amount_mismatch");
  assert.equal(result.payout, undefined);
});

test("claimed amount mismatch is flagged but the ledger amount still wins when the policy allows", () => {
  const result = evaluateClaim(claimFor("1042", { claimed_amount: 250.0 }), ledger, policy);
  assert.equal(result.disposition, "eligible");
  assert.ok(result.flags.includes("claimed_amount=250"));
  assert.equal(result.payout.amount, 29.0);
  assert.equal(result.payout.destination, LEDGER_DESTINATION);
});

// ------------------------------------------------------------------- determinism
test("determinism: identical input yields identical output", () => {
  const a = JSON.stringify(evaluateClaim(happyClaim, ledger, policy));
  const b = JSON.stringify(evaluateClaim(happyClaim, ledger, policy));
  assert.equal(a, b);
});

test("purity: evaluating does not mutate claim, ledger, or policy", () => {
  const claimCopy = structuredClone(happyClaim);
  const ledgerCopy = structuredClone(ledger);
  const policyCopy = structuredClone(policy);
  evaluateClaim(happyClaim, ledger, policy);
  assert.deepEqual(happyClaim, claimCopy);
  assert.deepEqual(ledger, ledgerCopy);
  assert.deepEqual(policy, policyCopy);
});

// ------------------------------------------------------------------------- CLI
test("CLI: happy path exits 0 and prints one JSON object with the ledger destination", async () => {
  const { stdout, stderr } = await run("node", [
    engine, "--claim", path.join(examples, "claim-1042.json"),
    "--ledger", path.join(examples, "ledger.json"),
    "--policy", path.join(examples, "policy.json"),
  ]);
  assert.equal(stderr, "");
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.disposition, "eligible");
  assert.equal(parsed.payout.destination, LEDGER_DESTINATION);
});

test("CLI: --pretty emits multi-line JSON", async () => {
  const { stdout } = await run("node", [
    engine, "--claim", path.join(examples, "claim-1042.json"),
    "--ledger", path.join(examples, "ledger.json"),
    "--policy", path.join(examples, "policy.json"), "--pretty",
  ]);
  assert.ok(stdout.split("\n").length > 3);
});

test("CLI: reads a claim from stdin with --claim -", async () => {
  const { stdout } = await run("bash", ["-c",
    `cat ${JSON.stringify(path.join(examples, "claim-1042-redirect.json"))} | node ${JSON.stringify(engine)} --claim - --ledger ${JSON.stringify(path.join(examples, "ledger.json"))} --policy ${JSON.stringify(path.join(examples, "policy.json"))}`,
  ]);
  assert.equal(JSON.parse(stdout).reason_code, "modification_attempt_detected");
});

test("CLI: invalid claim payload exits 2 while still printing a machine-readable verdict", async () => {
  await assert.rejects(
    () => run("node", [
      engine, "--claim", path.join(examples, "claim-1042.json"),
      "--ledger", path.join(examples, "policy.json"),
      "--policy", path.join(examples, "policy.json"),
    ]),
    (error) => {
      assert.equal(error.code, 2);
      assert.equal(JSON.parse(error.stdout).reason_code, "invalid_input");
      return true;
    },
  );
});

test("CLI: unknown argument exits 2 with usage on stderr", async () => {
  await assert.rejects(
    () => run("node", [engine, "--nonsense"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /unknown argument/);
      return true;
    },
  );
});

test("CLI: missing required arguments exits 2", async () => {
  await assert.rejects(
    () => run("node", [engine, "--claim", path.join(examples, "claim-1042.json")]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /usage:/);
      return true;
    },
  );
});

test("CLI: --already-handled refuses a duplicate claim for the same run", async () => {
  const { stdout } = await run("node", [
    engine, "--claim", path.join(examples, "claim-1042.json"),
    "--ledger", path.join(examples, "ledger.json"),
    "--policy", path.join(examples, "policy.json"),
    "--already-handled", "1042,1044",
  ]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.reason_code, "duplicate_claim_in_run");
  assert.equal(parsed.payout, undefined);
});

test("CLI: --help exits 0", async () => {
  const { stdout } = await run("node", [engine, "--help"]);
  assert.match(stdout, /usage:/);
});
