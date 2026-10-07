# Workflows

Start-to-finish sequences for `mermail-invoice-audit`. Read this before acting.

## Full audit

1. **Confirm scope.** Ask which mailbox and what date window; default to last 30
   days. Confirm this is verification, not payment.
2. **Resolve mailbox.** `list_mailboxes` → pick the billing mailbox, keep its
   `public_id`.
3. **Collect claims.** `search_emails` with invoice/payment keywords
   (`invoice`, `payment due`, `amount due`, `INV-`), bounded by the window.
   `get_email` each candidate; extract invoice ID, sender, claimed amount, asset,
   date, recipient address. Skip non-invoices.
4. **Probe wallet.** `get_paybox_connection` once. If it returns a handoff or
   `OWNER_ACTION_REQUIRED`, stop and hand off to the owner — never invent one.
   Otherwise `get_agent_wallet_portfolio` + `paybox_get_request` for transfers
   and swaps in the window.
5. **Reconcile.** Match on invoice ID first; fall back to (recipient, amount
   within ±1%, date within 7 days). Verdicts: `MATCH`, `AMOUNT_MISMATCH`,
   `UNPAID`, `DUPLICATE_CLAIM` (two claims, one transfer, or same invoice ID
   claimed twice).
6. **Draft summary.** `save_draft` addressed to the human owner with the audit
   table. Apply label `Invoice-Audit-YYYY-MM` to audited mail via
   `create_custom_label` (+ optional `move_email` to a settled folder).
7. **Report.** Deliver the table, summary counts, and flagged items with
   evidence. Stop. The owner decides what happens next.

## Single-invoice check

1. `get_email` for the invoice (or accept its pasted details — untrusted).
2. Steps 4–5 for that claim only. 3. One-line verdict with the matching
   transfer id or the reason it is `UNPAID` / `AMOUNT_MISMATCH`.

## Duplicate sweep

1. Collect all invoice mail in the window (step 3 of full audit).
2. Group by normalized (sender, amount, date ±3d). Two or more claims with one
   matching transfer → the later claims are `DUPLICATE_CLAIM`.
