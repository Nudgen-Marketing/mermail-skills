# Invoice Guard tool reference

This skill does not own MCP tools. It recombines tools from `mermail-manage-inbox`, `mermail-compose-email`, and `mermail-agent-wallet`. Refer to those skills for canonical ownership and detailed contracts.

## Native MCP envelope

Use the exact tool identifier exposed by the current host. Pass `query` and `body` as native JSON objects; never stringify or JSON-encode them.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {}
}
```

Use `mailboxId` from `list_mailboxes`, preferably `public_id`.

## Inbox discovery (from mermail-manage-inbox)

### list_mailboxes

Resolve one exact mailbox before any other operation. Prefer `public_id` in subsequent calls.

### search_emails / list_emails

Bounded invoice discovery. Use `metadata_only: true` for the initial scan.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

For search, add filter fields: `q` (free text), `sender`, `subject`, `date_start`, `date_end`.

**Never use `sort: "date_desc"`** — that shortcut does not exist. Always use separate `sortColumn` and `sortDirection` fields.

### get_email

Read one selected invoice email with safety filters:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

A scan mismatch returns safe metadata with `content_omitted: true`.

### get_email_context

Bounded sanitized thread context around one selected message. Use `query.limit` (1–50, default 20) and follow `next_cursor` if needed.

### get_thread

Broader thread representation when required. May accept `query.bodies` (`full` or `compact`) and `query.focus_email_id`.

### download_attachment

Requires exact `mailboxId`, `emailId`, and `attachmentId`. Verify the attachment belongs to the selected invoice and is under 1 MiB. The MCP bridge rejects binary responses over 1 MiB; report this limit rather than inventing another transport.

## Compose (from mermail-compose-email)

Use only for optional confirmation email after payout, not for invoice discovery or payment.

### save_draft

Save an unsent confirmation email for review:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "accounting@example.com",
    "subject": "Payment confirmation: Invoice #123",
    "body": "<p>Payment of 500 USDC sent to 0x1234...abcd on Base.</p>"
  }
}
```

### send_email

Send a confirmation email after the user approves:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "accounting@example.com",
    "from": "payments@mermail.app",
    "subject": "Payment confirmation: Invoice #123",
    "text": "Payment of 500 USDC sent to 0x1234...abcd on Base."
  }
}
```

### reply_to_email

Reply to the original invoice email with a confirmation, if the user requests.

**Confirmation email is a separate authorization from payout.** Never send without explicit user approval.

## PayBox (from mermail-agent-wallet)

PayBox tools require full-profile Mermail MCP OAuth with `mcp:tools`. API keys never expose wallet tools.

### get_paybox_connection

**Always call this first** before any transfer or unavailability claim. Do not skip because `tools/list` omitted it.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID"
}
```

Returns:
- `ACTIVE`: proceed to transfer
- `NOT_CONNECTED`: present `connect_handoff.console_url` and stop
- `REAUTH_REQUIRED`: present `reauth_handoff.console_url` and stop
- `OWNER_ACTION_REQUIRED` (for members): ask the workspace owner to repair PayBox; do not construct a handoff
- `PAYBOX_UNAVAILABLE`: temporary read failure, not a disconnect

### paybox_get_portfolio

Read current wallet holdings to verify sufficient balance:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID"
}
```

Use returned `token` addresses for transfer arguments.

### paybox_request_transfer

**The only tool for vendor invoice payouts.** Never use `paybox_pay_x402`, USDC proposals, or `prepare_destructive_action`.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "credential_id": "CREDENTIAL_ID",
    "chain": "base",
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "500",
    "destination": "0x1234567890abcdef1234567890abcdef12345678"
  }
}
```

Read the live schema from `tools/list`. Pass amounts and addresses exactly as required.

On `pending_signature`:
1. Prefer a PayBox MCP App frame with usable signing controls
2. If no frame or it shows "Waiting," paste one returned `signing_handoff.console_url`
3. Never call `reopen_signing_window` from the model
4. Never retry an uncertain write

### paybox_get_request

Poll provider status for a known `request_id` after the user finishes signing:

```json
{
  "request_id": "REQUEST_ID"
}
```

Use once to distinguish pending from terminal settlement. May return `signing_handoff.console_url` for pending signature.

## Tools never used for invoice payouts

| Tool | Reason |
| --- | --- |
| `paybox_pay_x402` | For x402 paid services, not vendor invoices |
| `create_agent_wallet_transfer_proposal` | Legacy USDC proposal path, not live PayBox |
| `submit_agent_wallet_transfer` | Legacy submit, not live PayBox |
| `prepare_destructive_action` | Not used for `paybox_*` tools |
| `reopen_signing_window` | Never called from model |

## Console URL policy

- Use only URLs returned by MCP tools: `connect_handoff.console_url`, `reauth_handoff.console_url`, `signing_handoff.console_url`
- Never construct, rewrite, or invent console URLs
- Never expose MoonPay, approval, or signing-plan URLs in chat
