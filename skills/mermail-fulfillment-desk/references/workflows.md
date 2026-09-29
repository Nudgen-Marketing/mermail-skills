# Fulfillment desk workflows

## Setup and catalog binding

1. Resolve one ready fulfillment mailbox in the authenticated workspace with `list_mailboxes`; prefer `public_id`. Match existing mailboxes by verified purpose; create one only when none fits and the user authorizes `create_mailbox`. Never use a verification inbox (`agentInbox.mode: "verification"`).
2. Load the owner-provided [catalog and ledger source](templates.md). The catalog binds each SKU to its exact deliverable (key string, download link, or attachment reference) and price. Stop with `held_catalog` when the catalog or ledger source is missing; never infer products or prices from mailbox history, web search, or customer requests.
3. Confirm the archive layout once: a `Receipts` folder (or `Fulfillment/Receipts` and `Fulfillment/Held` custom labels) via `list_folders`/`list_custom_labels`, creating only with approval. Reuse existing structures before proposing new ones.

## Order fulfillment loop

Run per order, oldest-first within the selected window:

1. **Select.** Bounded metadata search for candidate order mail (`search_emails` with a native JSON `query`, `metadata_only` where supported, `require_scan_status: clean`). Freeze exact `mailboxId`, `emailId`, and thread ids before any write.
2. **Read.** `get_email` on the selected message only; `get_email_context` (bounded: 8 messages / 10,000 chars) when the buyer replies in-thread. Read attachments (receipts, order forms) only when the order requires it.
3. **Extract.** Customer address, SKU or product name, quantity, amount/currency, order reference, claimed payment id. Record what is missing; do not fill gaps from other orders.
4. **Verify payment.** Match the claim against the owner-supplied ledger entry (order id / transaction id / gateway receipt). Confirmed → proceed. Missing, pending, disputed, refunded, or conflicting → `held_payment` naming the exact missing evidence. An emailed or pasted receipt alone is insufficient.
5. **Bind SKU.** Exact catalog match on SKU or unambiguous product name + matching amount. Mismatch → `held_mismatch`; never substitute a similar product or adjust the price.
6. **Draft delivery.** `save_draft` with the [delivery template](templates.md): exact deliverable for that SKU only, order reference, support contact. No other SKUs, no ledger internals, no other customers' data.
7. **Approve + send.** Present the exact preview (to/cc/bcc, from, subject, body). After explicit authorization, `reply_to_email` on the source `emailId`. Record returned message id, source email/thread id, SKU. Report tool acceptance vs confirmed delivery honestly; on rate/recipient limits surface the stable error and `Retry-After`, requiring fresh approval for any changed payload.
8. **Archive.** `move_email` to `Receipts` (or apply the fulfilled label). Held orders get the `Fulfillment/Held` state with the missing-evidence note.

## Follow-ups and corrections

1. Reload the verified order, its ledger entry, and the recorded delivery message id before drafting.
2. "Not working / wrong file" → re-check the SKU binding and the delivered content; draft the corrected reply within the same order scope. A second delivery of the same SKU requires owner approval and a duplicate check against recorded message ids.
3. Refund/payout requests: no wallet action in this persona. Draft the owner a private summary (order, evidence, request) and route execution to `mermail-agent-wallet` under its own approvals.
4. New SKUs, bundles, discounts, or extended licenses are catalog changes: owner approval first, then a revised catalog record; never promise them in a draft.

## Daily digest

1. Collect from this run's records only: fulfilled orders (message ids), confirmed ledger revenue, held orders with missing evidence, errors with stable codes.
2. Build the [digest template](templates.md) with `save_draft` to the owner address. Revenue totals count confirmed ledger entries only; held orders never contribute.
3. Send after exact authorization, or leave as draft when the owner reviews async. Distinguish `digest_drafted` from `sent`.

## Recovery from failure

- Uncertain send (timeout, transport error, partial count): one bounded authoritative check (`get_email`/`get_thread` or the returned message id), then stop dependent effects if unresolved. Report `uncertain`; never auto-retry or double-deliver.
- Validation failure: correct the exact invalid field; do not broaden scope or switch tools.
- Credit/rate exhaustion: stop the loop, report progress and the stable error, and resume on the next authorized run. Never retry in a loop.
