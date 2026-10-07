# Mermail Invoice Settler Tool Reference

This skill combines Mermail mailbox operations with PayBox Agent Wallet tools on an authenticated OAuth session.

## Mailbox Discovery & Reading
- `list_mailboxes`: Discover active mailbox IDs.
- `search_emails`: Search for invoice subjects, bounty submissions, or contractor keywords.
- `list_emails`: List messages within a target folder or thread.
- `get_email`: Fetch message body, sender headers, and attachments.
- `get_email_context`: Retrieve surrounding thread context.

## PayBox Agent Wallet
- `get_paybox_connection`: Probe PayBox connection status. Always called first.
- `get_agent_wallet_portfolio`: Inspect portfolio balances for USDC and native tokens.
- `paybox_request_transfer`: Execute on-chain token transfer to verified contractor wallet address.
- `paybox_get_request`: Check provider settlement state for a completed transfer.

## Email Dispatch
- `send_email`: Send new outgoing email receipt.
- `reply_to_email`: Send in-thread confirmation receipt directly to the invoice sender.
