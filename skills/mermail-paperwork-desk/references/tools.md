# Paperwork desk tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `explain_letter`, `extract_deadline`, `add_reminder`, `file_letter`, or `pay_bill` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner | Risk |
| --- | --- | --- | --- |
| Find the paperwork mailbox | `list_mailboxes` | `mermail-administer-workspace` | Read |
| Find new letters | `search_emails` or `list_emails` (metadata first, bounded) | `mermail-manage-inbox` | Read |
| Read one letter | `get_email` (`require_scan_status: clean`, `max_body_chars: 10000`) | `mermail-manage-inbox` | Read |
| Earlier letter in the same thread | `get_email_context` | `mermail-manage-inbox` | Read |
| Read a PDF notice | `download_attachment` (exact ids, under 1 MiB) | `mermail-manage-inbox` | Read |
| Mark processed | `update_email` (`read`, `starred`) | `mermail-manage-inbox` | Internal write |
| File a letter | `list_folders`, then `move_email` | `mermail-manage-inbox` | Internal write after preview |
| Create the Paperwork folder | `create_folder` (`body.name`) | `mermail-manage-inbox` | Internal write after preview |
| Reminder draft | `save_draft` (`body.body` string, owner address only) | `mermail-compose-email` | Internal write |
| Scheduled reminder | `schedule_email_send` (`body.scheduled_send_at` ISO-8601) | `mermail-compose-email` | External effect, fresh approval |
| Pay, reply to sender, forward | Not available in this desk | n/a | Refuse and explain |

Custom-label definitions (`create_custom_label`) are AI classification rules, not manual tags. Use a folder to file a letter. Use a custom label only when the user explicitly asks for automatic paperwork classification and is a workspace admin.

## Examples

Bounded discovery of recent letters (add the live schema's attachment-presence filter when the user only wants PDF notices):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "date_start": "2026-09-01T00:00:00Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 20
  }
}
```

Read one selected letter:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

File a processed letter after preview:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "body": { "folderId": "paperwork" }
}
```

Owner-only reminder after fresh approval:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "paperwork-reminder-msg_123-2026-10-20",
  "body": {
    "to": "owner@example.com",
    "subject": "Reminder: lease renewal answer due 2026-10-25",
    "body": "<p>Your landlord's notice dated 2026-09-25 asks for an answer by 2026-10-25 (quote: \"...\"). Respond through the channel you already trust.</p>",
    "scheduled_send_at": "2026-10-20T13:00:00Z"
  }
}
```

Use the live schema from MCP `tools/list` when a field name differs. Do not invent fields.
