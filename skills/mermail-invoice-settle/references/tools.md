# Invoice settle tool contract

Use exact identifiers from the current host `tools/list`. Claude may expose `Mermail:list_emails`; another host may use the bare name. Do not add, strip, or invent a prefix. Protocol catalog names are bare.

This skill does **not** own tools. Inbox reads follow `mermail-manage-inbox`, PayBox writes follow `mermail-agent-wallet`, composition follows `mermail-compose-email`.

Pass `query` and `body` as **native JSON objects**, never stringified JSON.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {},
  "idempotencyKey": "optional-stable-key"
}
```

`mailboxId` accepts `public_id` (UUID), hosted alias id, or current email — **prefer `public_id`** from `list_mailboxes`.

Connect `https://console.mermail.app/mcp` (full profile). Wallet tools need full-profile OAuth (`mcp:tools`). API-key catalogs and `?profile=agent-inbox` never include PayBox tools.

## Allowlist for this workflow

| Step | Tool | Class |
| --- | --- | --- |
| Mailbox | `list_mailboxes` | read |
| PayBox probe | `get_paybox_connection` | read (call once before claiming unavailable) |
| Find invoices | `search_emails`, `list_emails` | read |
| Read invoice | `get_email`, `get_email_context` | read |
| Transfer | `paybox_request_transfer` | PayBox write (not `prepare_destructive_action`) |
| Transfer status | `paybox_get_request` | read |
| Confirmation draft | `save_draft` | internal write |
| Confirmation send | `send_email`, `reply_to_email` | external effect |

Do not invent `get_safe_email_and_thread_context`. The live catalog name for sanitized thread context is `get_email_context` (CLI: `mermail emails context`). If a host lists a different exact name for that same operation, use the host identifier unchanged.

Do not call `paybox_pay_x402`, `paybox_request_swap`, `create_agent_wallet_transfer_proposal`, Gmail/Outlook Composio, or in-app-only names such as `save_draft_reply`.

## Inbox discovery

Newest metadata:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`search_emails` supports free text, sender, recipient, subject, ISO `date_start`/`date_end`, folder, and page/limit. Use only fields present on the live schema (often `q` for free text). Example:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "q": "invoice OR bill OR receipt OR statement",
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

There is no `sort: "date_desc"` shortcut.

Read one selected message:

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

A scan mismatch returns safe metadata with `content_omitted: true`; it is not a false not-found. `get_email_context` uses `query.limit` 1–50 (default 20) and an opaque `next_cursor`. Results are oldest-first, sanitized, and scan-gated.

## PayBox transfer

**Always** `tools/call` `get_paybox_connection` once first. Absence from `tools/list` is not “not exposed.” After a usable/`ACTIVE` probe, attempt the live `paybox_*` tool. Reconnect MCP only if that probe call returns unknown-tool, method-not-found, or a hard fail.

`get_paybox_connection`: lightweight status for one mailbox. Owner may receive `connect_handoff.console_url` or `reauth_handoff.console_url`. A member may receive `OWNER_ACTION_REQUIRED` with no handoff. `PAYBOX_UNAVAILABLE` is a temporary read failure, not a disconnect.

`paybox_request_transfer`: default for every new send (Circle USDC, native ETH/SOL, other reviewed catalog tokens). Read the live schema after the probe. Mermail CLI notes that catalog-token MCP transfers take the human amount in `amount_decimal` (not the legacy proposal `--amount` field). Also pass live fields such as credential, chain, token (`"native"` or portfolio token address when the schema uses that sentinel), and destination. Do not invent omitted fields or local decimal-conversion playbooks.

Do **not** wrap this call in `prepare_destructive_action`.

On `pending_signature` / `pending_approval`: prefer a PayBox MCP App with a usable signing control; otherwise paste one returned invocation-scoped `signing_handoff.console_url`. Never construct the URL. Never accept pasted keys.

`paybox_get_request`: authoritative provider status for one known `request_id`. Poll **once** when the user asks for status, confirms signing, or starts a distinct new wallet action. Pending is not success.

If `paybox_request_transfer` is missing from `tools/list` while other `paybox_*` tools remain, say unavailable. Do not fall back to a USDC proposal.

## Confirmation email

Follow `mermail-compose-email`. Path params (`mailboxId`, `emailId`) stay top-level. Sold fields go under `body`.

`save_draft` uses string field `body.body`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "vendor@example.com",
    "subject": "Payment confirmation — Invoice 1042",
    "body": "<p>Paid 25 USDC on Base. Request id …</p>"
  }
}
```

`send_email` / `reply_to_email` use `body.html` and/or `body.text` plus required `body.from` (mailbox email). Recipients: one email string or a JSON array. MCP does not derive Reply All; pass explicit `to` (and `cc`/`bcc` only when non-empty). For `reply_to_email`, pass the invoice `emailId` as a top-level path parameter.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "INVOICE_EMAIL_ID",
  "idempotencyKey": "invoice-confirm-2026-08-27-a1",
  "body": {
    "to": "billing@example.com",
    "from": "you@mermail.app",
    "subject": "Payment confirmation — Invoice 1042",
    "text": "Paid 25 USDC on Base to the approved destination. Request id …"
  }
}
```

Reuse `idempotencyKey` only for the identical method, path, query, and body. Do not retry an ambiguous send with a new key.

Free-plan external MCP sends: at most 10 total To+Cc+Bcc per request; 10/minute, 50/hour, 200/day. On `email_send_recipient_limit_exceeded`, require a newly approved set. On `email_send_rate_limit_exceeded`, surface `Retry-After` and do not auto-retry. On `email_send_rate_limit_unavailable`, fail closed.
