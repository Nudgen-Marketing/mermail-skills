# Mermail Invoice Settlement Tools Reference

This reference details the tools used by `mermail-invoice-settlement` across the inbox management, composition, and agent wallet domains.

## Inbox & Email Discovery Tools

- `search_emails`: Search mailboxes for invoice emails using structured queries. Pass `query` as a native JSON object (never stringify).
- `list_emails`: Retrieve recent messages with metadata filtering.
- `get_email`: Read email body and metadata. Always pass `agent_safe_content: true` and `require_scan_status: true`.
- `get_email_context`: Fetch full conversation thread to check prior payment correspondence.
- `download_attachment`: Download invoice attachments (PDF, CSV, image) up to the 1 MiB MCP boundary.
- `move_email`: Move settled or processed emails to designated folders (e.g., `Accounting`, `Paid`).
- `update_email`: Mark processed emails as read, starred, or categorized.

## Email Composition & Receipt Tools

- `reply_to_email`: Send payment confirmation replies to vendors with embedded transaction hashes.
- `save_draft`: Save payment receipt drafts for human review before sending.
- `send_email`: Send standalone invoice notifications or accounting reports.

## Agent Wallet & PayBox Settlement Tools

- `get_agent_wallet`: Inspect Agent Wallet address, current token balances (USDC, SOL), and network status.
- `get_paybox_connection`: Check active PayBox OAuth connection state.
- `create_agent_wallet_transfer_proposal`: Create an on-chain transfer proposal for workspace review.
- `submit_agent_wallet_transfer`: Submit an approved transfer proposal to the blockchain.
- `paybox_request_transfer`: Request direct PayBox token transfer to a vendor recipient address.
- `paybox_pay_x402`: Execute micro-settlements for HTTP 402 billable APIs or streaming invoices.
- `paybox_get_request`: Poll status and capture transaction signature / confirmation details.
- `prepare_destructive_action`: Obtain single-use tokens for protected operations where required.
