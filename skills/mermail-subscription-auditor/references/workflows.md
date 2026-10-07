# Subscription auditor workflows

## Resolve the mailbox

1. Call `list_mailboxes`. Prefer the mailbox the user names; ask when several fit.
2. Use `public_id` as `mailboxId` for every later call.
3. Do not provision a mailbox: an audit only reads mail that already exists.

## Collect receipt candidates

1. Agree the audit window (default 12 months) and warning horizon (default 14 days) with the user.
2. Run bounded `search_emails` passes: receipt vocabulary (receipt, invoice, renewal, trial, subscription, payment confirmation), then each vendor name the user supplies. Cap each pass and record truncation instead of paging without limit.
3. Deduplicate candidates by email id before inspection.

## Extract evidence

1. `get_email` one candidate at a time. Require `scan_status: clean`; keep flagged or unknown messages metadata-only and list them as skipped.
2. Extract only what the message states: vendor, plan, amount, currency, cadence, charge date. No stated amount means no ledger amount for that row.
3. Use `get_thread` to pair a trial notice with a later cancellation confirmation in the same thread before clearing a trial-conversion flag.

## Build the ledger and alerts

1. Group by vendor; normalize cadence to monthly, annual, or other.
2. Next renewal = latest charge date + cadence, always labeled an estimate.
3. Price increase = two consecutive same-plan receipts with different amounts; cite both email ids.
4. Rollup: monthly-equivalent and annualized totals over evidence-backed rows only.
5. Alerts: renewals and unresolved trial conversions inside the warning horizon.
6. Present ledger, rollup, alerts, and coverage limits (window, truncated passes, ambiguous vendors).

## Optional report send

1. Only on explicit request. Compose the report, preview exact To/subject/body, and wait for approval of that payload.
2. One `send_email` with one idempotency key. Verify the authoritative sent result; do not retry an uncertain send automatically.

## Optional cancellation draft

1. Only on explicit request. Address the vendor's billing contact found in receipt headers; if none exists, ask the user instead of guessing.
2. `save_draft` only. Sending requires a separate, fresh approval for the exact payload. Never claim a draft was sent.

## Optional receipt-flagging triager

1. Only on explicit request. `list_task_triagers` first and inspect existing configurations.
2. `create_task_triager` for classification and auto-draft only. Keep sends, deletes, payments, and admin out of the allowlist. Do not set a mailbox default.
