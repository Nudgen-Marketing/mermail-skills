# Mermail Solana Escrow Desk Tools

Reference guide for Mermail MCP tools utilized in escrow disbursement and receipt workflows.

## 1. Mailbox Operations
- `list_mailboxes`: Discover configured agent and corporate mailboxes. Prefers `public_id` as identifier.
- `list_emails`: Filter unread payment claims or invoices using `{ folder: "INBOX", query: "invoice OR claim OR bounty" }`.
- `get_email`: Fetch full headers, sanitized body, and attachments of a targeted email thread.
- `update_email`: Mark processed claims with labels (e.g. `Processed`, `Paid`, `Needs-Review`).

## 2. Wallet & PayBox Operations
- `get_paybox_connection`: Probe connection status and active wallet profile.
- `paybox_get_portfolio`: Inspect current token balances, including native SOL and SPL USDC.
- `paybox_request_transfer`: Execute an authorized transfer of tokens on Solana.
  - Arguments:
    - `chain`: `"solana"`
    - `asset`: `"USDC"`
    - `amount`: Raw amount or standard unit (as dictated by runtime schema)
    - `destination`: Payee Solana Base58 public key
    - `memo`: Optional reference invoice/PR ID
- `paybox_get_request`: Poll status of an in-flight or completed transfer request.

## 3. Communication & Settlement Receipts
- `save_draft`: Draft a payment receipt or approval notification for user inspection.
- `send_email`: Deliver terminal on-chain settlement receipts to verified payees.
