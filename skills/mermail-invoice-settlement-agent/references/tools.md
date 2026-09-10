# Tool Reference

## Mermail Inbox Tools
- `list_mailboxes`: Resolves the active mailbox `public_id`.
- `list_emails`: Queries inbox messages with `metadata_only: true` and `agent_safe_content: true`.
- `get_email`: Retrieves full email body sanitized against prompt injection.
- `reply_to_email`: Sends automated payment confirmation and transaction receipt.

## Mermail PayBox Tools
- `get_paybox_connection`: Probes PayBox wallet readiness (must return `ACTIVE`).
- `paybox_get_portfolio`: Inspects delegated balances (e.g., USDC, SOL).
- `paybox_request_transfer`: Initiates on-chain transfer to the recipient address.
- `paybox_get_request`: Polls status of a pending transfer using `request_id`.
