# Subscription desk workflows

## 1. Scope the desk

Resolve workspace and mailbox. Confirm with the owner: mailbox, currency of record, horizon in days, and whether the desk covers every recurring charge or one vendor. Write the scope down before reading mail; widening it later requires a new owner instruction.

## 2. Discover evidence

Search with billing vocabulary first. Cover both the charge side (invoice, receipt, payment received) and the commitment side (trial started, subscription renewed, price change, auto-renew, cancel before). Record the mailbox, the query, and the window used, so a later reader can reproduce the register.

## 3. Extract one row per charge

For each candidate message, extract vendor, plan, amount, currency, cadence, next renewal, cancellation window, trial end, evidence email id, and per-field confidence. Use `get_thread` to bind a renewal notice to its original purchase, and to detect a recharge that was already refunded or cancelled.

Rules that keep the register honest:

- a missing value stays unknown; a guess is a defect.
- one charge with two receipts is one row with two evidence ids.
- two vendors with the same amount are two rows.
- a one-off purchase is not a subscription; exclude it and say so.
- a currency without a stated amount cannot produce a normalized total.

## 4. Build the watchlist

Order rows by days remaining inside the horizon. For each row show the next renewal, the cancellation window, the evidence email id, and the missing fields that block a decision.

## 5. Prepare, never send

On an explicit owner request, prepare one draft per vendor with `save_draft`, then present the exact sender, recipient, subject, and body. Revise with `regenerate_draft` when asked. Delivery belongs to `mermail-compose-email` after the owner authorizes the exact message and timing.

## 6. Reconcile and follow up

When the owner returns with new evidence or a vendor replies, reconcile the affected rows instead of rebuilding the register: state what changed, which row it changed, and which row is now authoritative.

## Handoffs

| Situation | Handoff |
| --- | --- |
| Mailbox creation, custom domain, workspace member or storage change | `mermail-administer-workspace` |
| Provision or reuse a service mailbox for an active third-party signup, verification, or onboarding flow | `mermail-agent-inbox` |
| Ordinary historical reading, folders, labels, moves, deletions | `mermail-manage-inbox` |
| Drafting, sending, or scheduling the approved message | `mermail-compose-email` |
| Any payment, transfer, swap, funding, or x402 call | `mermail-agent-wallet` or `mermail-x402-agent` |
| Recurring automation or a triager that acts on renewal mail | `mermail-automate-triage` |
