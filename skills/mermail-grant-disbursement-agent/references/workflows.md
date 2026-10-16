# Grant disbursement workflows

## Workflow 1: Milestone triage and audit

1. Call `list_mailboxes` to identify the grant management inbox.
2. Query unread submissions with `search_emails(query: { q: "milestone" })`.
3. Call `get_email` to inspect the submission body, verify `scan_status: clean`, and extract:
   - Grant ID / Agreement reference
   - Milestone index / Phase
   - Deliverable artifacts (commit hash, PR link, deployed Solana program ID)
   - Requested amount and token
4. Audit deliverable artifacts against the acceptance criteria.

## Workflow 2: Treasury verification and disbursement staging

1. Call `get_paybox_connection` to confirm active treasury connection.
2. Call `paybox_get_portfolio` to verify sufficient balance for the requested amount.
3. Call `paybox_request_transfer` with:
   - `recipient`: verified grantee public key
   - `amount`: approved milestone amount
   - `token`: token mint (e.g., USDC)
   - `memo`: `Grant [ID] - Milestone [N] Payout`
4. Retrieve the `signing_handoff.console_url` via `show_paybox_signing` or `paybox_get_request`.
5. Present the proposal summary and signing link to the human reviewer.

## Workflow 3: Settlement reconciliation and receipt drafting

1. Poll `paybox_get_request` after signer confirms completion.
2. When status reaches `settled` / `completed`:
   - Extract transaction signature.
   - Call `save_draft` with structured confirmation:
     - Subject: `Re: [Original Milestone Subject] - Milestone Disbursed`
     - Body: Details of milestone approval, payout amount, and transaction signature.
3. Present the draft receipt to the grant manager for final approval.
