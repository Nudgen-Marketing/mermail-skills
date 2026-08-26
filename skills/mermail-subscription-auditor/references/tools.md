# Subscription auditor tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and receipt reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the mailbox to audit |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded receipt-vocabulary and vendor passes inside the audit window |
| `get_email` | `mermail-manage-inbox` | Inspect one candidate receipt; require `scan_status: clean` before body use |
| `get_thread` | `mermail-manage-inbox` | Correlate a trial notice with a later cancellation confirmation |

## Optional, approval-gated deliverables

| Tool | Owner | Role |
| --- | --- | --- |
| `send_email` | `mermail-compose-email` | Owner report after exact preview and approval (`body.from` + `html`/`text`, one idempotency key) |
| `save_draft` | `mermail-compose-email` | Cancellation request draft (`body.body` string); never auto-sent |
| `list_task_triagers` / `create_task_triager` | `mermail-automate-triage` | Inspect first, then draft-only receipt flagging on explicit request |

Do not call `set_default_task_triager`. Do not call PayBox / Agent Wallet tools, delete tools, or Composio from this workflow.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "text": "receipt",
    "dateFrom": "2025-08-01",
    "limit": 25
  }
}
```

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "sub-audit-report-2026-08-26-a1",
  "body": {
    "to": "owner@example.com",
    "from": "agent@mermail.app",
    "subject": "Subscription audit: 6 active, 2 renew in 14 days",
    "text": "Ledger and alerts as approved in preview"
  }
}
```
