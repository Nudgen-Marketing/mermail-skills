# Receipts agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and bounded reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover one ready mailbox; never provision for this workflow |
| `search_emails` | `mermail-manage-inbox` | Candidate receipts by free text (`query.query`), sender, subject, ISO `date_start`/`date_end`, attachment presence |
| `list_emails` | `mermail-manage-inbox` | Fallback paging of one folder (e.g. an existing `receipts` folder) |
| `get_email` | `mermail-manage-inbox` | One selected candidate, scan-gated and length-capped |
| `get_email_context` | `mermail-manage-inbox` | Only when a renewal notice refers to an earlier message in the thread |
| `download_attachment` | `mermail-manage-inbox` | Invoice PDF when the body lacks the amount; 1 MiB MCP limit |

## Internal writes (preview + approval)

| Tool | Owner | Role |
| --- | --- | --- |
| `list_folders` / `create_folder` | `mermail-manage-inbox` | Find or create the one target folder |
| `bulk_move_emails` | `mermail-manage-inbox` | File the previewed receipt ids |
| `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` | Admin-only AI classification definition for future receipts |
| `save_draft` | `mermail-compose-email` | Renewal-reminder draft (`body.body` string) |

No tool attaches a custom label to an existing message.

## External effect (exact preview + fresh approval)

| Tool | Owner | Role |
| --- | --- | --- |
| `schedule_email_send` | `mermail-compose-email` | One self-addressed reminder at a user-approved time |

## Optional wallet reads (full-profile OAuth only)

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Probe once before any PayBox read |
| `paybox_get_request` | `mermail-agent-wallet` | Read one user-supplied request ID |

API keys and the agent-inbox profile never expose PayBox tools. If the user is not on full-profile OAuth, skip reconciliation and say so. This workflow never calls PayBox writes.

## Examples

Candidate search (metadata only):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "query": "receipt",
    "folder": "inbox",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-30T23:59:59Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 50
  }
}
```

Read one selected receipt:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

File approved receipts:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "receipts-file-2026-09-a1",
  "body": { "ids": ["EMAIL_1", "EMAIL_2"], "folderId": "receipts" }
}
```

The free-text field is `query.query` (subject, preview, sender, recipients). It is a substring match, not boolean search: run one narrow call per term (for example `receipt`, `invoice`, `subscription`, `renewal`) and merge by email id. Always pass `folder: "inbox"` (or the receipts folder): unfiltered search also returns Sent copies that share the same `message_id`. On `rate_limit_exceeded`, report the partial result instead of retrying in a loop.

Approved self-addressed reminder (`schedule_email_send`):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "receipts-remind-2026-10-a1",
  "body": {
    "from": "you@mermail.app",
    "to": "you@mermail.app",
    "subject": "Renewals in the next 7 days",
    "body": "Figma — 2026-10-12 — 15.00 USD (estimated)",
    "body_format": "text",
    "scheduled_send_at": "2026-10-09T08:00:00Z"
  }
}
```
