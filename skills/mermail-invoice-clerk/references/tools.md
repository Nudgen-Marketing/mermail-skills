# Mermail Invoice Clerk Tools Reference

This skill coordinates between email ingestion, vendor communication, and Agent Wallet / PayBox execution using native Mermail MCP tools.

## Email & Mailbox Management (`mermail-manage-inbox`)

- `list_mailboxes`: Discover finance/AP mailboxes and retrieve `public_id`.
- `list_emails`: Retrieve recent message summaries in finance inboxes.
- `search_emails`: Query unread invoices (e.g. `subject:invoice`, `has:attachment`).
- `get_email`: Inspect full message headers, body content, and attachment metadata.
- `get_email_context`: Retrieve surrounding thread context for prior invoice history.
- `download_attachment`: Download and inspect invoice PDFs or structured CSV/JSON invoices.
- `move_email`: Move processed invoices to `Archive` or `Quarantine` folders.
- `create_custom_label`: Apply status tags such as `Audit/Verified`, `Audit/Quarantined`, or `Payment/Approved`.

## Vendor Communications (`mermail-compose-email`)

- `save_draft`: Create remittance advice draft or internal escalation note for review.
- `reply_to_email`: Send remittance receipts or request clarification directly within the vendor's thread.
- `send_email`: Send out-of-band security alerts or remittance notices to authorized billing contacts.

## Settlement & Agent Wallet (`mermail-agent-wallet`)

- `get_paybox_connection`: Check connection health (`ACTIVE`) and verify full-profile OAuth readiness.
- `get_agent_wallet`: Inspect primary wallet address, status, and network configuration.
- `paybox_get_portfolio`: Query wallet balances (USDC, SOL, ETH) to confirm funds before proposal creation.
- `paybox_request_transfer`: Prepare a policy-compliant token transfer proposal to the pinned vendor address.
- `create_agent_wallet_transfer_proposal`: Alternative proposal generator for multi-signatory or legacy wallet setups.
- `paybox_get_request`: Poll proposal status (`pending_signature`, `success`, `rejected`) using the returned `request_id`.

## Safety Invariants

- Destructive operations (such as permanently deleting emails) require `prepare_destructive_action`.
- PayBox transfer tools require human interactive passkey signing via the returned `console_url`.
