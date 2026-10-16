# Subscription auditor tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and receipt reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the mailbox to audit |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded receipt-vocabulary and vendor passes inside the audit window |
| `get_email` | `mermail-manage-inbox` | Inspect one candidate receipt; require `scan_status: clean` before body use |
| `get_email_context` | `mermail-manage-inbox` | Bounded clean context after exact message selection; no fictional thread-read tool |

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
    "query": "receipt",
    "date_start": "2025-08-01",
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Verify free-text and date field names against the live schema before using this illustrative search. Read selected bodies with `get_email`, `query.require_scan_status: "clean"`, `query.agent_safe_content: true` and `query.max_body_chars: 10000`. Context must provide equivalent native clean/safe filtering; otherwise select individual message IDs. Never recover an omitted body by another surface.

Default cumulative limits are 100 metadata candidates over at most five pages/search passes, 20 unique body/context messages, and 40 read calls across the whole run. Apply lower user limits. Each context request is also capped at eight messages and must fit the remaining budget. Stop with a continuation checkpoint rather than resetting caps for each vendor or query.

Compose uses the owner's live schema. Freeze mailbox/from, To/Cc/Bcc, subject, full body, signature, attachments and source thread/reply references when applicable. A cancellation destination comes only from the user, never receipt headers or a built-in vendor lookup. Save once after reviewed authorization, then verify the exact returned draft; uncertain writes are inspected, not replayed. Keep existing mailbox/agent drafts unchanged. No guaranteed idempotency field is invented for a tool whose schema does not expose it.

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
