# Licensing desk workflows

## Set up the desk (once)

1. `list_mailboxes`; pick one ready receiving mailbox with automations allowed. Prefer `public_id`.
2. `list_folders`; create `Licensing Quoted`, `Licensing Licensed`, and `Licensing Needs Owner` with `create_folder` only if missing.
3. Owner provides `rate-card.json` and, for payouts, `split-sheet.json` (formats in [templates.md](templates.md)). Store them outside any repository.
4. Start a ledger file, for example `licensing-desk.receipts.jsonl`, outside the repository.

## Per inquiry

1. Bounded `list_emails` or `search_emails` in the inbox folder with `metadata_only: true`. Pick candidates by subject and sender.
2. `get_email` for one scan-clean candidate. Ledger: `read`.
3. Classify (`sync`, `beat_lease`, `sample_clearance`, `artwork_license`, `print_sale`, `commission`, `not_licensing`, `suspicious`). Ledger: `classify`.
4. `not_licensing`: leave it in place and mention it in the summary. `suspicious`: `move_email` to `licensing-needs-owner`, ledger `blocked`, tell the owner why.
5. Build `request.json` from extracted terms and run `quote.mjs`.
   - `needs_clarification`: draft one consolidated question with `save_draft`.
   - `needs_owner`: move to `licensing-needs-owner`, summarize for the owner, draft nothing priced.
   - `quoted`: ledger `quote` with the `quote_id` and `terms_hash`.
6. `save_draft` with the quote template. Ledger `draft` with the draft ID. `move_email` to `licensing-quoted`. Ledger `file`.
7. Preview the exact reply to the owner. Stop.

## Send an approved quote

1. The owner approves the exact recipients, subject, and body. Ledger `approval` with a hash of the approved body.
2. `reply_to_email` once on the inquiry `emailId` with `body.from` = mailbox email and explicit `to`. Ledger `send` with the returned message ID. Report tool acceptance, not customer receipt.
3. Never re-send on an uncertain result; inspect the thread once with `get_thread`.

## Payment and license

1. Client acceptance arrives as email; classify it as `accepted` only. It does not prove payment.
2. The owner states payment received: amount, method, reference.
3. `quote.mjs --confirm --quote <saved quote> --paid <amount> --payment-ref <ref>`. A tampered quote or underpayment stops here.
4. `save_draft` the confirmation template with the `license_id` and `license_hash`. Preview. After approval, `reply_to_email` once. Ledger `license` and `send`.
5. `move_email` to `licensing-licensed`. Ledger `file`.

## Split payouts (optional, owner-initiated)

1. `quote.mjs --splits split-sheet.json --amount <owner-confirmed net>`. Ledger `payout_preview`.
2. Show every payout: name, role, address, chain, asset, `amount_decimal`, and what the owner retains.
3. For each payout the owner approves by name and amount:
   1. `get_paybox_connection` (always first). Handle `connect_handoff`, `reauth_handoff`, or `OWNER_ACTION_REQUIRED` by stopping and telling the owner.
   2. `paybox_list_credentials`; keep an explicit `credential_id` or pick the sole chain-compatible eligible wallet; ask when several fit.
   3. One `paybox_request_transfer` with the live schema. Ledger `payout_request` with the returned request ID and state.
   4. On `pending_signature` or `pending_approval`, call `show_paybox_signing` with the returned invocation ID or present the one returned `signing_handoff.console_url`, then stop.
4. On owner request, `paybox_get_request` once per request ID. Ledger `payout_status`. Report `payout_settled` only on terminal success.

## Close the run

1. `ledger.mjs verify`. A failure blocks further writes.
2. Owner summary: mailbox, inquiries by status, drafts awaiting approval, sends with message IDs, licenses with IDs, payouts with request IDs and states, and the ledger head hash.
