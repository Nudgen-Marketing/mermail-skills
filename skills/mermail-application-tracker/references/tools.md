# Application tracker tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` / `get_email_context` | `mermail-manage-inbox` | Bounded scan-gated recruiter-mail reads |
| `save_draft` | `mermail-compose-email` | Tracker summary thread and follow-up drafts (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved follow-up sends (`body.from` + `body.html` and/or `body.text`) |
| `schedule_email_send` | `mermail-compose-email` | Deadline reminders (`body.body` + `scheduled_send_at`, ISO-8601 UTC) |

Send, reply, and forward nest Sold fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.

This is a list illustration; use only the actual live search schema for search filters, not list-only sorting. Selected body reads require native `require_scan_status: "clean"`, `agent_safe_content: true`, `max_body_chars: 10000`. Context must have equivalent native filtering and an explicit remaining-budget limit or use selected individual IDs; never bypass an omission with raw fetches. All pages and context share SKILL.md limits.

Draft/save content uses `body.body`, with resolved `to`, `subject` and exact existing `draft_id` when updating. Source replies retain supported thread/reply references; a board is not a recruiter reply and must never inherit recruiter recipients. The live compose owner defines actual fields; do not invent a folder or pin field. Missing targets/binding means proposed text only. After an uncertain save, inspect the exact returned/selected draft instead of creating another.

For sends and schedules freeze workspace/mailbox, source thread/message, sender, To/Cc/Bcc, subject, complete content, signature, attachments, draft version and timestamp. Changed payloads need fresh approval. Use stable operation/idempotency identities only where live semantics support them; a client string is not a proven server lock. To cancel an existing scheduled send use the inbox owner's exact destructive contract: cancellation preserves content rather than proving delivery was undone. No cancellation or replacement occurs without its separate user approval.
