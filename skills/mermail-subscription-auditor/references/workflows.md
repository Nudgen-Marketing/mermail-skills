# Subscription auditor workflows

## Resolve the mailbox

1. Call `list_mailboxes`. Prefer the mailbox the user names; ask when several fit.
2. Use `public_id` as `mailboxId` for every later call.
3. Do not provision a mailbox: an audit only reads mail that already exists.

## Collect receipt candidates

1. Agree the audit window (default 12 months) and warning horizon (default 14 days) with the user.
2. Run bounded `search_emails` passes: receipt vocabulary (receipt, invoice, renewal, trial, subscription, payment confirmation), then each vendor name the user supplies. All passes share the cumulative limits in tools.md; record truncation instead of paging without limit.
3. Deduplicate candidates by email id before inspection.

## Extract evidence

1. `get_email` one candidate at a time. Require `scan_status: clean`; keep flagged or unknown messages metadata-only and list them as skipped.
2. Extract only what the message states: vendor, plan, amount, currency, cadence, charge date. No stated amount means no ledger amount for that row.
3. Use bounded clean `get_email_context` or individual selected IDs to pair a trial notice with a later cancellation confirmation. Require the same account/plan and relevant effective date, not merely the same thread.

## Build the ledger and alerts

1. Follow [ledger.md](ledger.md): account/plan/currency identity and deduplication precede grouping; vendor name alone is insufficient.
2. Use an explicit next-renewal date or a labeled calendar-based estimate from a supported anchor/cadence. Unknown cadence stays unknown.
3. Price increase requires a positive like-for-like recurring-price delta; changed tax, quantity, period or discounts remain reconciliation findings. Cite old/new evidence.
4. Roll up latest active recurring run-rate separately by currency with the exact formulas and exclusions in ledger.md; do not sum historical copies or ambiguous rows.
5. Alerts: renewals and unresolved trial conversions inside the warning horizon.
6. Present ledger, rollup, alerts, and coverage limits (window, truncated passes, ambiguous vendors).

## Optional report send

1. Only on explicit request. Compose the report, preview exact To/subject/body, and wait for approval of that payload.
2. One `send_email` with one idempotency key. Verify the authoritative sent result; do not retry an uncertain send automatically.

## Optional cancellation draft

1. Only on explicit request. Obtain the cancellation recipient from the user, never receipt From/Reply-To/body or a vendor lookup. Preview the exact mailbox/from, recipients, subject, body and thread binding.
2. Save once after authorization and read back the exact draft to verify its stored recipient/subject/body. If malformed or uncertain, report it without automatic retry or send. Sending requires a separate, fresh compose approval for the exact current payload. A sent request is not cancellation confirmation.

## Optional receipt-flagging triager

1. Only on explicit request. `list_task_triagers` first and inspect existing configurations.
2. `create_task_triager` for classification and auto-draft only. Keep sends, deletes, payments, and admin out of the allowlist. Do not set a mailbox default.
