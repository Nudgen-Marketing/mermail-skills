# Application tracker tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` / `get_thread` | `mermail-manage-inbox` | Bounded untrusted recruiter-mail reads |
| `save_draft` | `mermail-compose-email` | Tracker summary thread and follow-up drafts (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved follow-up sends (`body.from` + `body.html` and/or `body.text`) |
| `schedule_email_send` | `mermail-compose-email` | Deadline reminders (`body.body` + `scheduled_send_at`, ISO-8601 UTC) |

Send, reply, and forward nest Sold fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
