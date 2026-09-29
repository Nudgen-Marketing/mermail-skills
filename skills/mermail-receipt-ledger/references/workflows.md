# Receipt ledger workflows

## Resolve a source mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.

## Build the ledger

1. Agree window and filters (default last 30 days; keywords such as receipt, invoice, billing, payment confirmation, or named vendors).
2. `search_emails` / `list_emails` with a capped page size. Prefer metadata-only until a candidate is worth opening.
3. `get_email` (and `get_thread` / `get_email_context` when needed) only for clean-scanned messages.
4. Extract rows: vendor, date, amount, currency, document type (`receipt` / `invoice` / `statement` / `unknown`), confidence, email id, notes.
5. Deduplicate obvious resends of the same invoice id or identical amount+vendor+date when visible; otherwise keep both and mark for owner review.
6. Present the draft ledger before filing or digest send.

## File receipts

1. Ask whether to use a custom label, a folder, both, or neither.
2. `list_custom_labels` / `list_folders` first. Create only after approval of the exact name.
3. Move only messages the owner accepted as ledgered. Leave `uncertain` rows in place unless the owner says otherwise.

## Owner digest

1. `save_draft` a summary: window, row count, totals by currency when all amounts are known, uncertain count, and next actions.
2. Preview To/subject/body with `body.from` = mailbox email. Obtain send approval for that exact payload.
3. `send_email` or `forward_email` once with one idempotency key. Verify the authoritative result. Do not retry an uncertain send automatically.

## Optional PayBox context

1. Skip unless the user explicitly asks to compare the ledger with Agent Wallet / PayBox.
2. Require full-profile OAuth. If only an API key is available, state that PayBox is unavailable and finish the inbox ledger.
3. Call `get_paybox_connection` once before claiming PayBox tools are missing.
4. Read portfolio only (`paybox_get_portfolio` / `get_agent_wallet_portfolio`). Never transfer, swap, pay x402, or use plugins from this workflow.
5. Present portfolio as context beside the ledger; do not claim the ledger and wallet reconcile dollar-for-dollar unless both sides have explicit matching fields.
