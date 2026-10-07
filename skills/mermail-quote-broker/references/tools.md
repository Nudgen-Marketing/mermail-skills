# Quote broker tool contract

This skill owns no MCP tools. It composes tools owned by other skills and follows their contracts. Use the exact identifier the host exposes (for example `Mermail:list_emails` in Claude, bare `list_emails` at the protocol boundary). Pass `query` and `body` as native JSON objects, never stringified JSON.

## Tools used and their owners

| Step | Tool | Owner skill | Class |
| --- | --- | --- | --- |
| Find or choose mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` | read |
| Provision (only if authorized) | `create_mailbox` | `mermail-agent-inbox` / `mermail-administer-workspace` | internal write, consumes credits |
| Job folder | `list_folders`, `create_folder` | `mermail-manage-inbox` | read, internal write |
| Baseline and collect | `list_emails`, `search_emails`, `get_email`, `get_email_context` | `mermail-manage-inbox` | read |
| File and mark read | `move_email`, `update_email` | `mermail-manage-inbox` | internal write after preview |
| Draft | `save_draft` | `mermail-compose-email` | internal write |
| Send RFQ / reply / memo | `send_email`, `reply_to_email` | `mermail-compose-email` | external effect |
| Pay a winner (handoff only) | `paybox_request_transfer` | `mermail-agent-wallet` | never called here |

## Baseline (before the first send)

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Record the returned Mermail email `id` values. Do not use provider or RFC `message_id` as the baseline.

## Collect replies

Search establishes candidates only. Remove baseline ids client-side, then fetch each candidate.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "RFQ-7f3a",
    "date_start": "2026-10-06T00:00:00.000Z",
    "metadata_only": true,
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "limit": 25
  }
}
```

Search returns `{ "emails": [...], "totalCount": N }`. Filters such as `from`, `to`, and `subject` are substring matches that find candidates and are never authentication. Confirm optional fields against the live schema (`tools/list`).

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

A scan mismatch returns safe metadata with `content_omitted: true`. Keep that vendor `uncertain` and do not interpret a body.

## Send one RFQ per vendor (external effect)

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "rfq-7f3a-v1",
  "body": {
    "from": "buyer-desk@mermail.app",
    "to": "sales@vendor-one.example",
    "subject": "[RFQ-7f3a] Quote request: 50 embroidered hoodies",
    "text": "PLAIN TEXT RFQ"
  }
}
```

Content uses `body.html` and/or `body.text`. Drafts and negotiation drafts use the string `body.body` instead. For a reply, pass the source `emailId` as the top-level path parameter and an explicit `to`.

## Limits to surface, not evade

- Free external sends are limited to 10 To+Cc+Bcc recipients per request, and recipient windows of 10/minute, 50/hour, 200/day. Do not split a job to evade them.
- `429` and `503 email_send_rate_limit_unavailable`: stop after one call, surface `Retry-After`, never auto-retry a send.
- Attachments over 1 MiB cannot be downloaded through MCP. Report the limit.
- A successful `create_mailbox` consumes 10 provision credits.
