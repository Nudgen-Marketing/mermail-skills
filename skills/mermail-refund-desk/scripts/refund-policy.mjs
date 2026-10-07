#!/usr/bin/env node
/**
 * mermail-refund-desk / refund-policy
 *
 * Pure, dependency-free eligibility engine for one inbound billing complaint.
 *
 * THE INVARIANT: the claim never selects the money.
 *   `payout` (amount, asset, chain, destination) is read ONLY from the ledger entry.
 *   There is deliberately no code path that reads an address, amount, or asset from `claim`.
 *
 * The engine performs no I/O other than reading the three files named on the command line,
 * never touches the network, never writes, and never calls Mermail. The reading agent passes
 * the observed inbound mail in as data; the engine turns that into a deterministic disposition.
 *
 * Usage:
 *   node scripts/refund-policy.mjs --claim <file|-> --ledger <file> --policy <file>
 *                                  [--paid-this-run <n>] [--already-handled <ref,ref>] [--pretty]
 *
 * Exit codes: 0 = a disposition was computed (eligible | needs_human | rejected),
 *             2 = input could not be parsed/validated (disposition "rejected"/"invalid_input").
 */

const EXIT_INVALID_INPUT = 2;

function parseArgs(argv) {
  const out = { paidThisRun: 0, pretty: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      i += 1;
      return value;
    };
    if (arg === "--claim") out.claim = next();
    else if (arg === "--ledger") out.ledger = next();
    else if (arg === "--policy") out.policy = next();
    else if (arg === "--paid-this-run") out.paidThisRun = Number(next());
    else if (arg === "--already-handled") out.alreadyHandled = next().split(",").map((v) => v.trim()).filter(Boolean);
    else if (arg === "--pretty") out.pretty = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function emailDomain(address) {
  const at = normalizeEmail(address).lastIndexOf("@");
  return at === -1 ? "" : normalizeEmail(address).slice(at + 1);
}

/**
 * Allowlisted-domain match on a real host boundary.
 * `evil-example.com` must NOT match `example.com` — so an exact host or a strict
 * dot-boundary suffix is required. Never a substring test.
 */
function domainAllowed(address, allowedDomains) {
  if (!isValidEmail(address)) return false;
  const host = emailDomain(address);
  if (!host) return false;
  return (allowedDomains ?? []).some((raw) => {
    const allowed = normalizeEmail(raw).replace(/^\./, "");
    if (!allowed) return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nearlyEqual(a, b) {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return false;
  return Math.abs(a - b) <= 1e-9;
}

const SETTLED = new Set(["settled", "captured", "paid", "succeeded", "refunded"]);
const UNSETTLED = new Set(["pending", "unknown", "processing", "authorized", "disputed"]);
const REFUND_DONE = new Set(["refunded", "settled", "paid", "succeeded"]);

function decision(disposition, reason_code, extra = {}) {
  return {
    disposition,
    reason_code,
    ...extra,
  };
}

/**
 * @param {any} claim  untrusted, observed from inbound mail
 * @param {any} ledger owner-authored system of record
 * @param {any} policy owner-authored policy
 * @param {{paidThisRun?: number}} run
 */
export function evaluateClaim(claim, ledger, policy, run = {}) {
  const paidThisRun = isFiniteNumber(run.paidThisRun) ? run.paidThisRun : 0;

  // ---- 1. structural validation -------------------------------------------------
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
    return decision("rejected", "invalid_input", { detail: "claim must be an object" });
  }
  if (!ledger || typeof ledger !== "object" || !Array.isArray(ledger.orders)) {
    return decision("rejected", "invalid_input", { detail: "ledger.orders must be an array" });
  }
  if (!policy || typeof policy !== "object") {
    return decision("rejected", "invalid_input", { detail: "policy must be an object" });
  }
  if (
    !isFiniteNumber(policy.max_refund_per_claim) ||
    !isFiniteNumber(policy.max_refunds_per_run) ||
    policy.max_refund_per_claim <= 0 ||
    policy.max_refunds_per_run <= 0
  ) {
    return decision("rejected", "invalid_input", {
      detail: "policy.max_refund_per_claim and policy.max_refunds_per_run must be positive numbers",
    });
  }
  if (typeof policy.currency_unit !== "string" || !policy.currency_unit.trim()) {
    return decision("rejected", "invalid_input", { detail: "policy.currency_unit is required" });
  }

  const base = {
    policy_version: policy.policy_version ?? null,
    ledger_revision: ledger.ledger_revision ?? null,
    unit: policy.currency_unit,
  };

  // ---- 2. bind the claim to a ledger record -------------------------------------
  const orderRef = claim.order_ref === undefined || claim.order_ref === null
    ? ""
    : String(claim.order_ref).trim();
  if (!orderRef) {
    return decision("needs_human", "unresolvable_order_reference", {
      ...base,
      flags: ["no_order_reference_in_claim"],
      next_action: "ask_owner",
    });
  }

  const order = ledger.orders.find((candidate) => String(candidate?.order_ref ?? "").trim() === orderRef);
  if (!order) {
    return decision("needs_human", "order_not_in_ledger", {
      ...base,
      order_ref: orderRef,
      flags: [],
      next_action: "ask_owner",
    });
  }

  const sender = normalizeEmail(claim.from_email);
  const ledgerCustomer = normalizeEmail(order.customer_email);
  const flags = [];

  // ---- 3. identity: the sender must BE the ledger's customer --------------------
  if (!isValidEmail(claim.from_email)) {
    return decision("rejected", "invalid_input", {
      ...base,
      order_ref: orderRef,
      detail: "claim.from_email is not a usable address",
    });
  }
  const senderMatchesCustomer = sender === ledgerCustomer;
  const senderOnAllowedDomain = !senderMatchesCustomer && domainAllowed(claim.from_email, policy.allowed_customer_domains);
  if (!senderMatchesCustomer && !senderOnAllowedDomain) {
    return decision("rejected", "identity_mismatch", {
      ...base,
      order_ref: orderRef,
      customer_email: order.customer_email ?? null,
      sender_email: sender,
      flags: ["sender_is_not_the_ledger_customer"],
      next_action: "none",
    });
  }
  if (!senderMatchesCustomer && senderOnAllowedDomain) flags.push("identity_via_allowed_domain");

  // ---- 4. idempotency: has this order already been made whole? ------------------
  const priorRefunds = Array.isArray(order.prior_refunds) ? order.prior_refunds : [];
  if (priorRefunds.some((refund) => REFUND_DONE.has(String(refund?.status ?? "").toLowerCase()))) {
    return decision("rejected", "already_refunded", {
      ...base,
      order_ref: orderRef,
      customer_email: order.customer_email ?? null,
      flags: ["prior_refund_recorded"],
      next_action: "none",
    });
  }

  // ---- 5. a pending charge is never a refundable charge -------------------------
  const charges = Array.isArray(order.charges) ? order.charges : [];
  if (charges.length === 0) {
    return decision("needs_human", "order_not_in_ledger", {
      ...base,
      order_ref: orderRef,
      flags: ["ledger_entry_has_no_charges"],
      next_action: "ask_owner",
    });
  }
  const unsettled = charges.filter((charge) => UNSETTLED.has(String(charge?.status ?? "").toLowerCase()));
  if (unsettled.length > 0) {
    return decision("needs_human", "unsettled_charge_present", {
      ...base,
      order_ref: orderRef,
      flags: ["pending_or_unknown_charge_is_not_settlement"],
      next_action: "ask_owner",
    });
  }
  const settled = charges.filter((charge) => SETTLED.has(String(charge?.status ?? "").toLowerCase()));
  if (settled.length === 0) {
    return decision("needs_human", "unsettled_charge_present", {
      ...base,
      order_ref: orderRef,
      flags: ["no_settled_charge"],
      next_action: "ask_owner",
    });
  }

  // ---- 6. is it actually a duplicate? ------------------------------------------
  if (settled.length === 1) {
    return decision("rejected", "duplicate_not_confirmed", {
      ...base,
      order_ref: orderRef,
      customer_email: order.customer_email ?? null,
      verified: { charge_ids: settled.map((c) => c.charge_id), settled_count: 1 },
      flags: [],
      next_action: "reply",
    });
  }
  if (settled.length > 2) {
    return decision("needs_human", "manual_review_multiple_charges", {
      ...base,
      order_ref: orderRef,
      verified: { charge_ids: settled.map((c) => c.charge_id), settled_count: settled.length },
      flags: ["more_than_two_settled_charges"],
      next_action: "ask_owner",
    });
  }
  const [first, second] = settled;
  if (!isFiniteNumber(first?.amount) || !isFiniteNumber(second?.amount) || !nearlyEqual(first.amount, second.amount)) {
    return decision("needs_human", "manual_review_amount_mismatch", {
      ...base,
      order_ref: orderRef,
      verified: {
        charge_ids: settled.map((c) => c.charge_id),
        settled_count: 2,
        amounts: settled.map((c) => c?.amount ?? null),
      },
      flags: ["two_settled_charges_with_different_amounts"],
      next_action: "ask_owner",
    });
  }
  const duplicateAmount = first.amount;
  const verified = {
    charge_ids: settled.map((c) => c.charge_id),
    settled_count: 2,
    duplicate_amount: duplicateAmount,
    unit: policy.currency_unit,
  };

  // ---- 7. the money comes from the ledger, or not at all -----------------------
  const payout = order.payout;
  if (!payout || typeof payout !== "object") {
    return decision("needs_human", "no_authorized_destination", {
      ...base, order_ref: orderRef, verified, flags: ["ledger_has_no_payout_block"], next_action: "ask_owner",
    });
  }
  if (typeof payout.destination !== "string" || !payout.destination.trim()) {
    return decision("needs_human", "no_authorized_destination", {
      ...base, order_ref: orderRef, verified, flags: ["ledger_payout_has_no_destination"], next_action: "ask_owner",
    });
  }
  if (!isFiniteNumber(payout.amount) || payout.amount <= 0) {
    return decision("needs_human", "no_authorized_destination", {
      ...base, order_ref: orderRef, verified, flags: ["ledger_payout_has_no_positive_amount"], next_action: "ask_owner",
    });
  }

  // ---- 8. untrusted-input signals ----------------------------------------------
  if (claim.modification_attempt === true) {
    flags.push("claim_attempted_to_change_payout_terms");
    if (policy.hold_on_modification_attempt !== false) {
      return decision("needs_human", "modification_attempt_detected", {
        ...base,
        order_ref: orderRef,
        verified,
        flags,
        // Reported for audit only. It is never the destination the agent may use:
        // the ledger destination is the single authoritative value below.
        ledger_destination: payout.destination,
        ignored_claim_destination: typeof claim.claimed_destination === "string" ? claim.claimed_destination : null,
        next_action: "ask_owner",
      });
    }
  }
  if (isFiniteNumber(claim.claimed_amount) && !nearlyEqual(claim.claimed_amount, duplicateAmount)) {
    flags.push(`claimed_amount=${claim.claimed_amount}`);
    if (policy.hold_on_claim_amount_mismatch === true) {
      return decision("needs_human", "claim_amount_mismatch", {
        ...base, order_ref: orderRef, verified, flags, next_action: "ask_owner",
      });
    }
  }

  // ---- 9. run-level idempotency: one payout per order per run -------------------
  // The same complaint can legitimately appear more than once in a mailbox: a sent record plus the
  // delivered inbound copy, a duplicated delivery, or two messages in the same thread. Once a claim
  // for an order has been granted in this run, a second message for that order is refused rather
  // than becoming a second payout.
  const alreadyHandled = Array.isArray(run.alreadyHandled)
    ? run.alreadyHandled.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (alreadyHandled.includes(orderRef)) {
    return decision("rejected", "duplicate_claim_in_run", {
      ...base,
      order_ref: orderRef,
      customer_email: order.customer_email ?? null,
      flags: ["same_order_already_granted_this_run"],
      next_action: "none",
    });
  }

  // ---- 10. policy caps and allowlists -------------------------------------------
  if (payout.amount > policy.max_refund_per_claim) {
    return decision("needs_human", "over_policy_cap", {
      ...base,
      order_ref: orderRef,
      verified,
      attempted_payout: { amount: payout.amount, unit: policy.currency_unit, source: "ledger" },
      flags: [`cap=${policy.max_refund_per_claim}`],
      next_action: "ask_owner",
    });
  }
  if (policy.require_amount_not_above_duplicate !== false && payout.amount > duplicateAmount + 1e-9) {
    return decision("needs_human", "amount_above_verified_duplicate", {
      ...base,
      order_ref: orderRef,
      verified,
      attempted_payout: { amount: payout.amount, unit: policy.currency_unit, source: "ledger" },
      flags: ["ledger_payout_exceeds_verified_duplicate"],
      next_action: "ask_owner",
    });
  }
  const allowedAssets = (policy.allowed_assets ?? []).map((a) => String(a).toLowerCase());
  const allowedChains = (policy.allowed_chains ?? []).map((c) => String(c).toLowerCase());
  const assetOk = allowedAssets.length === 0 || allowedAssets.includes(String(payout.asset ?? "").toLowerCase());
  const chainOk = allowedChains.length === 0 || allowedChains.includes(String(payout.chain ?? "").toLowerCase());
  if (!assetOk || !chainOk) {
    return decision("needs_human", "asset_or_chain_not_allowed", {
      ...base,
      order_ref: orderRef,
      verified,
      attempted_payout: {
        amount: payout.amount, unit: policy.currency_unit,
        asset: payout.asset ?? null, chain: payout.chain ?? null, source: "ledger",
      },
      flags: ["asset_or_chain_outside_policy_allowlist"],
      next_action: "ask_owner",
    });
  }
  if (paidThisRun >= policy.max_refunds_per_run) {
    return decision("needs_human", "run_cap_reached", {
      ...base,
      order_ref: orderRef,
      verified,
      flags: [`paid_this_run=${paidThisRun}`, `max_refunds_per_run=${policy.max_refunds_per_run}`],
      next_action: "ask_owner",
    });
  }

  // ---- 11. eligible -------------------------------------------------------------
  return decision("eligible", "duplicate_confirmed_eligible", {
    ...base,
    order_ref: orderRef,
    customer_email: order.customer_email ?? null,
    verified,
    payout: {
      amount: payout.amount,
      asset: payout.asset ?? null,
      chain: payout.chain ?? null,
      destination: payout.destination,
      destination_source: "ledger",
    },
    flags,
    next_action: "owner_approval",
  });
}

// ---------------------------------------------------------------------------- CLI
const USAGE = `usage: refund-policy --claim <file|-> --ledger <file> --policy <file> [--paid-this-run <n>] [--already-handled <ref,ref>] [--pretty]`;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(spec, reader) {
  const text = spec === "-" ? await readStdin() : await reader(spec, "utf8");
  return JSON.parse(text);
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(decision("rejected", "invalid_input", { detail: error.message }))}\n`);
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return EXIT_INVALID_INPUT;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!args.claim || !args.ledger || !args.policy) {
    process.stdout.write(`${JSON.stringify(decision("rejected", "invalid_input", { detail: "claim, ledger, and policy are required" }))}\n`);
    process.stderr.write(`${USAGE}\n`);
    return EXIT_INVALID_INPUT;
  }

  const { readFile } = await import("node:fs/promises");
  let claim;
  let ledger;
  let policy;
  try {
    [claim, ledger, policy] = await Promise.all([
      readJson(args.claim, readFile),
      readJson(args.ledger, readFile),
      readJson(args.policy, readFile),
    ]);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(decision("rejected", "invalid_input", { detail: error.message }))}\n`);
    return EXIT_INVALID_INPUT;
  }

  const result = evaluateClaim(claim, ledger, policy, {
    paidThisRun: args.paidThisRun,
    alreadyHandled: args.alreadyHandled ?? [],
  });
  process.stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
  return result.reason_code === "invalid_input" ? EXIT_INVALID_INPUT : 0;
}

// Only run the CLI when executed directly (not when imported by the test suite).
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
