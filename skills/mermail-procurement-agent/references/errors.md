# Errors

Mermail returns a stable `code` with every wallet failure. **Fix the call from the code — never retry the same request**, because a charge is not idempotent. This file maps the live Agent Wallet codes onto procurement states so a procurement never repays on an ambiguous result and never reports a false blocker.

Source of truth: [Errors and recovery](https://docs.mermail.app/agent-wallet/errors-and-recovery) and [Catalog token transfers](https://docs.mermail.app/agent-wallet/catalog-transfers). Read the live schema before every write; do not reuse a stale one.

## Amount and argument errors — safe to fix and call again

Nothing reached PayBox. These do **not** consume the one charge allowed per `procurement_id`; correcting the arguments and calling once more is the same charge attempt, not a second one.

| Code | Procurement state | Recovery |
| --- | --- | --- |
| `paybox_amount_requires_decimal` | `awaiting_approval` | Resend with `amount_decimal` set to the human amount and **omit** `amount` |
| `paybox_amount_scale_mismatch` | `awaiting_approval` | Resend with `amount_decimal` only |
| `paybox_amount_below_dust_floor` | `blocked` | The charge implies less than about $0.01 on a trusted price. Ask the user for an amount worth at least $0.01. Do **not** round up on your own — that changes the envelope |
| `paybox_amount_value_mismatch` | `awaiting_approval` | Implied USD differs from `value_cents` by more than 3x. Restate the amount or correct `value_cents` |
| `paybox_invalid_arguments` | `awaiting_approval` | Read the asset from the portfolio and resend complete arguments |

### Amount contract

This contract governs the payee shapes — `paybox_request_transfer`, `request_payment`, `request_swap`. `paybox_pay_x402` carries **no amount argument**: the figure comes from the challenge's `accepts[]`, so none of the amount codes below can be raised by it.

Never convert the amount to base units yourself. Mermail refuses an integer `amount` for any asset whose decimals it can resolve, because the same request has produced both the intended value and a 1000x-short one.

| Field | Send |
| --- | --- |
| `chain` | CAIP-2 chain id, for example `eip155:8453` for Base |
| `token` | The asset's contract address, or `native` for the chain asset. Read it from `paybox_get_portfolio` or `get_agent_wallet_portfolio` |
| `to` | The complete destination address |
| `amount_decimal` | The human amount exactly as the user stated it — `1`, or `0.000053389889845` |
| `amount` | Base units, **only** when Mermail cannot resolve the asset's decimals |

The dust floor fails **closed** on a trusted quote and **open** on an ambiguous portfolio balance, so a correct `amount_decimal` is still the skill's responsibility.

## Connection errors — distinguish the three, they are not interchangeable

| Code / status | Handoff returned? | Procurement state | Recovery |
| --- | --- | --- | --- |
| `paybox_not_connected` | `connect_handoff.console_url` | `needs_paybox_connect` | Paste that one URL |
| `paybox_reauth_required` | `reauth_handoff.console_url` | `needs_paybox_connect` | Paste that one URL, wait for the user to reconnect PayBox inside Mermail |
| `OWNER_ACTION_REQUIRED` | **none** | `blocked` | A member cannot repair the owner's shared connection. Ask the **workspace owner** to connect or reauthorize PayBox. **Do not construct a URL and do not switch identities** |
| `wallet_paybox_credential_unavailable` | none | `blocked` | No active credential matches this chain. Ask the user to connect or unlock the wallet. Never ask for a pasted key |
| `paybox_write_retry_required` | none | `awaiting_approval` | A write raced with token refresh. Re-check `get_paybox_connection`, then start a new write **only if still connected** |
| `paybox_oauth_unavailable` | none | `blocked` | Stop. Ask the user to reconnect if status is `REAUTH_REQUIRED` |

Never send the user to Claude, ChatGPT, Cursor, or Codex **connector settings** for PayBox authorization. PayBox is authorized inside Mermail, not in the host's MCP settings.

## Upstream errors — the repayment trap

| Code | Procurement state | Recovery |
| --- | --- | --- |
| `paybox_upstream_uncertain` | `paid_unreconciled` | The submission timed out or returned malformed output; the outcome is **unknown**. Never retry automatically. Verify the request status **and the destination balance** before anything else |
| `paybox_tool_error` | `uncertain` | PayBox rejected the operation (stale signing plan, low nonce). Do not reuse the parked request or invocation id and do not keep polling it |
| `paybox_signing_unsupported` | `blocked` | Stop. Do not expose the signing plan, retry the payment, or substitute another signing route |
| `paybox_signing_app_unavailable` | `pending_signature` | Stop. Do not invent a signing URL or start a replacement payment |
| `paybox_continuation_origin_not_found` | `uncertain` | Submit failed is **not** success and **not** awaiting signature. Call `paybox_get_request` once if a `request_id` exists. Paste a signing URL only when that poll shows real `pending_signature` |

`pending`, `pending_paybox_approval`, and `SUBMISSION_UNKNOWN` are **not success**. Treat them as unresolved. They leave the procurement at `paid_unreconciled`, which is where receipt reconciliation takes over.

## Portfolio reads during an outage — do not invent a funding blocker

`get_agent_wallet` can return `connection.status: PAYBOX_UNAVAILABLE` with an **empty portfolio** and a null `portfolio_app`. That means PayBox did not answer that one read.

- An empty portfolio under `PAYBOX_UNAVAILABLE` means balances are **missing, not zero**.
- **Never** derive `needs_funding` from it. Reporting a funding shortfall the user does not have is a false blocker that costs them a top-up they did not need.
- Read again later. Do not tell the user to reconnect or reauthorize.
- The console keeps the last portfolio on screen during this, so what the user sees and what the tool returned can differ briefly — say which one you are quoting.

A genuine disconnect is `NOT_CONNECTED`. An expired delegation is `REAUTH_REQUIRED`. Only those two need the user.

## Mailbox and inbox results — bounded, never retried blind

| Result | Procurement state | Recovery |
| --- | --- | --- |
| `create_mailbox` conflict or uncertain response | `needs_mailbox` | `list_mailboxes`, resolve the exact normalized address, reuse it if it matches this service. Do not call create again |
| Detail read returns not found for a message the poll listed | unchanged | The default triager is holding it. Repeat the one detail read with `include_held: true`; do not re-trigger the vendor |
| Expected message absent after two minutes on a reused standard mailbox | `awaiting_verification` / `receipt_pending` only after the hold | Allow the five-minute stale-hold window, or poll with `include_held: true`. Absence before that is not delivery failure |
| `scan_status: flagged`, or `scan_threats` with `source: attachment` | `receipt_pending` | Quarantine: metadata only, no body, no attachment, no links. Report it |
| `download_attachment` rejected over 1 MiB | `receipt_pending` | Report the MCP limit. Do not construct a storage or download URL |
| Folder name rejected (no alphanumeric characters) | unchanged | Name the folder from the `procurement_id`, which always contains alphanumerics; do not skip filing |
| Mermail `402` — API credits exhausted for the period | unchanged | Stop. Report the leg reached and whether money moved. Credits are usage units, not currency; do not confuse this with a vendor 402 |
| Mermail `429` — workspace RPM or send limit | unchanged | Stop for this minute; do not tighten the poll. Free workspaces allow 10 requests per minute |

## Confirmation boundary

`confirmation_required` (403) applies to destructive **non-PayBox** Mermail tools: call `prepare_destructive_action` for the exact tool and arguments, then call the tool once. **Never** use that recovery for `paybox_*` or legacy Agent Wallet submit/reject tools. `confirmation_unavailable` (503) means do not call the gated tool at all until the outage clears.
