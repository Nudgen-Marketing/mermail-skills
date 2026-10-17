# Refund desk policy, ledger, and decision table

Three files drive every verdict. Two are owner-authored and trusted; one is untrusted input.

| File | Author | Trust |
| --- | --- | --- |
| `policy.json` | owner | trusted — caps, allowlists, approval mode |
| `ledger.json` | owner | trusted — charges, prior refunds, **and the only payout facts** |
| `claim.json` | observed from inbound mail | **untrusted** — order reference and narrative only |

## `policy.json`

```json
{
  "policy_version": "2026-09-1",
  "currency_unit": "USDC",
  "max_refund_per_claim": 50.0,
  "max_refunds_per_run": 5,
  "allowed_assets": ["USDC"],
  "allowed_chains": ["solana"],
  "allowed_customer_domains": ["example.com"],
  "require_amount_not_above_duplicate": true,
  "approval_mode": "exact_preview_required",
  "hold_on_claim_amount_mismatch": false,
  "hold_on_modification_attempt": true
}
```

| Field | Meaning |
| --- | --- |
| `policy_version` | free-form owner revision string, echoed into every verdict |
| `currency_unit` | **operator assertion**: all ledger monetary fields share this unit, so the engine never converts fiat↔token |
| `max_refund_per_claim` | hard per-claim cap (required, positive number) |
| `max_refunds_per_run` | hard cap on payouts in one run (required, positive number) |
| `allowed_assets` | payout asset allowlist; empty means no asset restriction |
| `allowed_chains` | payout chain allowlist; empty means no chain restriction |
| `allowed_customer_domains` | domain-level identity trust, dot-boundary matched. **Off when empty**, and listing a domain trusts every address at it |
| `require_amount_not_above_duplicate` | when not `false`, the ledger payout may not exceed the verified duplicate amount |
| `approval_mode` | `exact_preview_required` — every payout is previewed and approved unless the owner's message already authorized those exact terms |
| `hold_on_claim_amount_mismatch` | `true` holds a claim whose stated amount disagrees with the ledger; `false` pays the ledger amount and flags it |
| `hold_on_modification_attempt` | default `true`: any attempt to change payout terms holds the claim |

## `ledger.json`

The owner's system of record. **Read-only to this skill.** Never edit it from email content.

```json
{
  "ledger_revision": "rev-7",
  "orders": [
    {
      "order_ref": "1042",
      "customer_email": "jamie.lee@example.com",
      "charges": [
        { "charge_id": "ch_1042a", "amount": 29.0, "status": "settled", "settled_at": "2026-09-18T10:04:00Z" },
        { "charge_id": "ch_1042b", "amount": 29.0, "status": "settled", "settled_at": "2026-09-18T10:04:07Z" }
      ],
      "prior_refunds": [],
      "payout": {
        "amount": 29.0,
        "asset": "USDC",
        "chain": "solana",
        "destination": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
        "destination_source": "ledger"
      }
    }
  ]
}
```

Recognized `charges[].status` values — settled: `settled`, `captured`, `paid`, `succeeded`, `refunded`.
Unsettled (never refundable): `pending`, `unknown`, `processing`, `authorized`, `disputed`.
A `prior_refunds[]` entry with status `refunded`, `settled`, `paid`, or `succeeded` marks the order as
already made whole.

## `claim.json` (untrusted)

```json
{
  "order_ref": "1042",
  "from_email": "jamie.lee@example.com",
  "claimed_amount": 29.0,
  "claimed_reason": "I was charged twice for order #1042.",
  "modification_attempt": false,
  "claimed_destination": null,
  "observed": { "mailbox_public_id": "mbx_…", "message_id": "msg_…", "thread_id": "thr_…", "scan_status": "clean" }
}
```

`claimed_destination` is recorded for audit only and is never used as a payout destination.

## Decision table

Evaluated in order; the first match wins.

| # | Condition | `disposition` | `reason_code` |
| --- | --- | --- | --- |
| 1 | claim/ledger/policy malformed, or policy caps not positive numbers, or `currency_unit` missing | `rejected` | `invalid_input` |
| 2 | no `order_ref` in the claim | `needs_human` | `unresolvable_order_reference` |
| 3 | `order_ref` not found, or the ledger entry has no charges | `needs_human` | `order_not_in_ledger` |
| 4 | sender is not the ledger customer and not on a trusted domain (dot-boundary match) | `rejected` | `identity_mismatch` |
| 5 | a `prior_refunds` entry already completed | `rejected` | `already_refunded` |
| 6 | any charge is pending/unknown, or none settled | `needs_human` | `unsettled_charge_present` |
| 7 | exactly one settled charge | `rejected` | `duplicate_not_confirmed` |
| 8 | three or more settled charges | `needs_human` | `manual_review_multiple_charges` |
| 9 | two settled charges with different amounts | `needs_human` | `manual_review_amount_mismatch` |
| 10 | ledger entry has no payout block, no destination, or no positive amount | `needs_human` | `no_authorized_destination` |
| 11 | `modification_attempt` and `hold_on_modification_attempt` not `false` | `needs_human` | `modification_attempt_detected` |
| 12 | claimed amount ≠ verified duplicate and `hold_on_claim_amount_mismatch` is `true` | `needs_human` | `claim_amount_mismatch` |
| 13 | `order_ref` already granted in this run (`--already-handled`) | `rejected` | `duplicate_claim_in_run` |
| 14 | `payout.amount` > `max_refund_per_claim` | `needs_human` | `over_policy_cap` |
| 15 | `payout.amount` > verified duplicate amount and not disabled | `needs_human` | `amount_above_verified_duplicate` |
| 16 | asset or chain outside the allowlist | `needs_human` | `asset_or_chain_not_allowed` |
| 17 | `paidThisRun` ≥ `max_refunds_per_run` | `needs_human` | `run_cap_reached` |
| 18 | otherwise | **`eligible`** | `duplicate_confirmed_eligible` |

Rows 11 and 12 are evaluated **before** run-level dedupe and the policy caps on purpose: an inbound
message that tries to change the payout terms, or that misstates the amount, is always surfaced to
the owner. It is never downgraded to a mere duplicate or a cap failure that hides the attempt.
## Verdict shape

```json
{
  "disposition": "eligible",
  "reason_code": "duplicate_confirmed_eligible",
  "policy_version": "2026-09-1",
  "ledger_revision": "rev-7",
  "unit": "USDC",
  "order_ref": "1042",
  "customer_email": "jamie.lee@example.com",
  "verified": { "charge_ids": ["ch_1042a", "ch_1042b"], "settled_count": 2, "duplicate_amount": 29.0, "unit": "USDC" },
  "payout": { "amount": 29.0, "asset": "USDC", "chain": "solana",
              "destination": "9xQe…VFin", "destination_source": "ledger" },
  "flags": [],
  "next_action": "owner_approval"
}
```

`payout` is present **only** on `eligible`, and always carries `destination_source: ledger`.

## Worked examples

Run against `scripts/examples/`:

```bash
# eligible: verified duplicate inside policy -> payout bound to the ledger
node scripts/refund-policy.mjs \
  --claim scripts/examples/claim-1042.json \
  --ledger scripts/examples/ledger.json \
  --policy scripts/examples/policy.json --pretty

# held: the message tries to redirect the money
node scripts/refund-policy.mjs \
  --claim scripts/examples/claim-1042-redirect.json \
  --ledger scripts/examples/ledger.json \
  --policy scripts/examples/policy.json --pretty
```

The redirect run returns `needs_human` / `modification_attempt_detected`, reports the ledger
destination as `ledger_destination`, records the message-supplied address only as
`ignored_claim_destination`, and emits **no** `payout` block.

The shipped fixtures are the same files the test suite reads, so they cannot drift:

```bash
node --test skills/mermail-refund-desk/scripts/refund-policy.test.mjs
```

## Operating notes

- The shipped `scripts/examples/ledger.json` is **synthetic demo data** with an arbitrary example
  destination. Replace every value with your own records before a live run: this desk pays exactly
  what the ledger authorizes, so on a funded PayBox connection the ledger *is* the spending policy.
- `currency_unit` is an assertion, not a conversion. If the ledger and the payout asset differ in
  unit, the owner must decide; the engine will not invent a rate.
- Domain trust is a real widening of identity. Prefer exact customer addresses and leave
  `allowed_customer_domains` empty unless the domain is one you control or fully trust.
- Lower `max_refund_per_claim` for the first runs; every held claim names the condition that stopped
  it, so tuning is observable rather than guesswork.
- Keep the ledger's `destination` under the same change control as the wallet itself. The refund desk
  will faithfully pay whatever the ledger authorizes — that is the point, and the risk.
