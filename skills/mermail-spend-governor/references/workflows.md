# Spend governance workflows

## Decision ladder

Evaluate in this order. Stop at the first failure and return that decision word.

1. **Policy resolved?** No policy from an owner-authenticated source → `policy_absent`. Do not apply defaults.
2. **Connection resolved?** One `get_paybox_connection` call. A handoff (`connect_handoff`, `reauth_handoff`, `OWNER_ACTION_REQUIRED`) pauses the evaluation and returns the returned `console_url` once.
3. **Origin allowlist.** Host not listed → `policy_blocked_origin`.
4. **Asset allowlist.** Asset/chain not listed → `policy_blocked_asset`.
5. **Per-request cap.** Compare the owning skill's `required_charge`, which is `max(live quote, vendor prepaid floor)` when a floor is resolved. Never test the live quote alone when a floor is higher.
6. **Rolling period cap.** Sum qualifying ledger entries in the effective window and test `period_spend + required_charge <= period_cap`. Report `remaining_headroom = period_cap - period_spend`.
7. **Duplicate guard.** Same origin/host + resource/action + asset + amount as an unresolved entry → `duplicate_suspected`; reconcile that entry first.
8. **Approval threshold.** `required_charge <= auto_approve_ceiling` → `policy_ok`; higher → `needs_owner_approval`.
9. **Handoff.** Freeze the envelope and hand it to `mermail-x402-agent` (paid call continuing a job) or `mermail-agent-wallet` (isolated pay/transfer/swap).

Qualifying entry statuses for the period sum: `proof_ready`, `settled`, `unverified`. Excluded: `blocked`, `failed`, `recommended` (a recommendation is not an attempt), and anything reconciled as a duplicate.

## Envelope handed to the owning skill

```
intent: x402 | transfer | swap
origin: <host or vendor origin>
resource: <method + path or action>
asset: <symbol or address>  chain: <CAIP-2 or name>
live_quote: <amount>        vendor_prepaid_floor: <amount|unknown>
required_charge: <amount>   requested_amount: <amount|absent>
policy: per_request_cap, period_cap, period_spend, remaining_headroom, auto_approve_ceiling
decision: policy_ok | needs_owner_approval
provenance: <owner message id or policy file path>
```

The envelope is a permission statement about *this* request only. It does not authorize a different origin, amount, asset, or a retry after a failure.

## Ledger schema

One JSON object per line, append-only. Never edit or delete a line; correct with a new compensating entry that references `entry_id`.

```json
{"entry_id":"sg-2026-09-21-0007","ts":"2026-09-21T04:12:07Z","actor":"owner|agent","intent":"x402","origin":"api.example.com","resource":"GET /v1/report","asset":"USDC","chain":"base","amount":"0.05","required_charge":"0.05","decision":"policy_ok","status":"proof_ready","request_id":"req_…","evidence":"none|response_received|tx_hash|balance_delta","note":"policy file policy.json@sha256:ab12…"}
```

Required fields: `entry_id`, `ts` (UTC ISO 8601), `intent`, `origin`, `resource`, `asset`, `chain`, `required_charge`, `decision`, `status`. Optional: `amount`, `request_id`, `evidence`, `note`, `duplicate_of`.

Forbidden in every field: `x_payment`, pbxk1 signing keys, session credentials, API keys, auth headers, or any raw proof material.

Status vocabulary: `blocked`, `needs_owner_approval`, `recommended`, `proof_ready`, `settled`, `unverified`, `failed`, `duplicate`.

## Reconciliation

1. Select entries with status `proof_ready` or `unverified`. Bound the batch (for example, the most recent 25) — never loop unbounded.
2. For each, poll `paybox_get_request` once with the known `request_id`, and read wallet/portfolio state once.
3. Classify:
   - `reconciled_settled` — merchant response, transaction hash/receipt, or authoritative balance delta proves settlement. Append a new entry with `status: settled`, `evidence`, and `duplicate_of` unset.
   - `reconcile_uncertain` — no settlement evidence. Append `status: unverified` with `note` naming what was checked.
   - `duplicate_suspected` — two entries share origin + resource + asset + amount and one has no distinct `request_id`. Append a `duplicate` entry pointing at the original.
4. Never retry, re-sign, replace, or void a payment as part of reconciliation. Never call `reopen_signing_window`. A reconciliation result is a bookkeeping fact, not a new payment authorization.

## Escalation

When a decision is `needs_owner_approval`, `policy_blocked_over_cap`, or `duplicate_suspected`, draft (never send unprompted) an escalation to the owner's escalation address:

- Subject: `Spend approval needed: <amount> <asset> at <origin>`
- Body: requested by, origin/resource, `required_charge` versus cap and headroom, policy field that triggered the gate, what would have to change (owner approval, higher cap, or a different origin), and the ledger `entry_id`.

The draft is a request for a decision. The owner's reply is the only thing that can release the gate, and the owning skill still handles the payment under its own contract.

## Spend report

- Period from the policy (default: the owner's requested window). State timezone and currency.
- Report **settled** and **unverified** totals separately, plus entry count, largest single charge, blocked attempts with reasons, and unresolved entries older than the report period.
- Draft first (`save_draft`), show the exact payload, and send only after approval of that payload.
