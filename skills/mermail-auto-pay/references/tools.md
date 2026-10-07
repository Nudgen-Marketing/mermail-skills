# Tools Reference

This document lists the Mermail MCP tools used by the `mermail-auto-pay` skill and their exact payload shapes.

## Mailbox Resolution

### `list_mailboxes`

Returns all mailboxes accessible to the authenticated workspace. Call once per session to discover the target inbox.

```json
{
  "name": "list_mailboxes",
  "arguments": {}
}
```

**Response fields used:**
- `mailboxes[].public_id` - Stable mailbox identifier (use for all subsequent calls).
- `mailboxes[].email` - The mailbox email address (use as `from` for replies).

## Email Monitoring

### `list_emails`

Fetches emails from a mailbox with optional filtering.

```json
{
  "name": "list_emails",
  "arguments": {
    "mailboxId": "<public_id>",
    "query": "is:unread newer_than:3d"
  }
}
```

**Common query filters:**
- `is:unread` - Unread messages only.
- `newer_than:3d` - Messages from the last 3 days.
- `subject:invoice` - Subject contains "invoice".

**Response fields used:**
- `emails[].id` - Unique email identifier (used for reconciliation tracking).
- `emails[].subject` - Email subject line.
- `emails[].from` - Sender address and display name.
- `emails[].body_preview` - Plain text preview of the email body.
- `emails[].received_at` - ISO-8601 timestamp.
- `emails[].has_attachments` - Boolean indicating attachments.

### `get_email`

Fetches the full email content including body and attachment metadata.

```json
{
  "name": "get_email",
  "arguments": {
    "mailboxId": "<public_id>",
    "emailId": "<email_id>"
  }
}
```

**Response fields used:**
- `body_text` - Full plain text body.
- `body_html` - Full HTML body (for structured invoice parsing).
- `attachments[].filename` - Attachment filename.
- `attachments[].content_type` - MIME type.
- `attachments[].id` - Attachment identifier (for download if supported).

## Agent Wallet Operations

### `paybox_inspect`

Inspects the current Agent Wallet state including delegated balances.

```json
{
  "name": "paybox_inspect",
  "arguments": {}
}
```

**Response fields used:**
- `balances[]` - Array of token balances available for delegated spending.
- `balances[].token` - Token mint address or ticker.
- `balances[].amount_decimal` - Human-readable balance string.

### `paybox_request_transfer`

Requests a transfer from the Agent Wallet to a specified recipient.

```json
{
  "name": "paybox_request_transfer",
  "arguments": {
    "to": "<recipient_wallet_address>",
    "token": "USDC",
    "amount_decimal": "150.00",
    "memo": "INV-2026-0042 payment"
  }
}
```

**Required fields:**
- `to` - Valid Solana wallet address (base58, 32-44 characters).
- `token` - Token identifier (ticker or mint address).
- `amount_decimal` - Human-readable amount as a string (e.g., "150.00").

**Optional fields:**
- `memo` - On-chain payment reference string.

**Response fields used:**
- `transaction_signature` - Solana tx signature for on-chain verification.
- `status` - Execution status ("completed", "pending", "failed").

## Email Sending (Confirmation)

### `send_email`

Sends a payment confirmation reply to the invoice sender.

```json
{
  "name": "send_email",
  "arguments": {
    "mailboxId": "<public_id>",
    "to": ["<payee_email>"],
    "subject": "Re: Invoice INV-2026-0042 - Payment Confirmed",
    "body": "Payment of 150.00 USDC has been completed.\n\nTransaction: https://solscan.io/tx/<signature>\n\nReference: INV-2026-0042",
    "in_reply_to": "<original_email_id>"
  }
}
```
