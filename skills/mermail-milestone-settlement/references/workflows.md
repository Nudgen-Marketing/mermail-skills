# Milestone settlement agent workflows

## 1. Mailbox discovery and intake

1. Call `list_mailboxes`. Prefer an active mailbox dedicated to grants, bounties, or finance with `can_receive` true and receiving status ready.
2. Search for inbound milestone claims with a bounded query using `search_emails` or `list_emails`.
3. Read the candidate message with `get_email` and inspect thread context with `get_email_context`.
4. Enforce `scan_status: clean` and verify sender authentication before processing deliverables.

## 2. Deliverable verification and claim parsing

1. Extract the claiming grantee/builder, grant/bounty reference ID, completed milestone number, deliverable URL (e.g. GitHub PR or deployed contract), and requested payout amount.
2. Verify that the requested amount matches the pre-approved milestone allocation from the agreement.
3. If deliverables or payout amounts do not match authorized terms, flag the discrepancy and draft a clarification request rather than proposing a payout.

## 3. Wallet balance and PayBox probe

1. **Always** call `get_paybox_connection` once as the initial PayBox probe. Continue if status is `ACTIVE`.
2. Call `get_agent_wallet_portfolio` to verify available treasury balance for the requested asset and chain (e.g., USDC on Solana).
3. If balance is insufficient to cover the tranche, generate a funding recommendation report with `paybox_get_buy_link` and pause.

## 4. Transfer proposal execution

1. Construct the exact transfer parameters: asset (e.g., USDC), network/chain (e.g., Solana), recipient destination address, and exact tranche amount.
2. Show an exact preview to the authenticated user detailing recipient, amount, fee, and milestone evidence.
3. Upon user authorization, call `create_agent_wallet_transfer_proposal` or `paybox_request_transfer` once.
4. Present the returned `signing_handoff.console_url` for workspace owner authorization. Never attempt to sign autonomously.

## 5. Settlement confirmation drafting

1. Preview a confirmation reply referencing the grant ID, milestone tranche, proposal ID, and on-chain explorer link.
2. Call `save_draft` (or `reply_to_email` upon explicit send authorization) with structured confirmation details.
3. Apply a custom label (e.g. `milestone:payout-proposed`) via `update_email` to mark the submission processed.
4. Conclude with a concise status report distinguishing verified deliverables, generated proposal ID, and required owner signature.
