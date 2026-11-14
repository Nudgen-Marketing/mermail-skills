# W-9 agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `request_w9`, `collect_w9`, or `file_1099` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find W-9 / W-8 threads | `list_emails`, `search_emails`, `get_email`, `get_thread`, `get_email_context` | `mermail-manage-inbox` |
| Inspect a selected form | `download_attachment` after clean scan; 1 MiB MCP limit | `mermail-manage-inbox` |
| Draft a request | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send / reply with a request | `send_email` or `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Log the selected thread | `list_folders` then `move_email` | `mermail-manage-inbox` |
| Optional inbound classifier | `list_custom_labels` then `create_custom_label` (does not tag existing mail) | `mermail-manage-inbox` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready collection mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |

Do not call PayBox tools. Do not call `set_default_task_triager`. MCP does not auto-fill Reply All. Do not invent IRS e-file or 1099-filing tools.

## Search query shape

Pass `query` as a native object. Example metadata-first search using documented filters (`from`, `subject`, `date_start`). Inspect the live schema before adding other fields:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "from": "contractor@example.com",
    "subject": "W-9",
    "date_start": "2026-01-01T00:00:00.000Z",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Do not pass `"query": "{\"subject\":\"W-9\"}"`. Keep the window bounded. Do not invent a `sort: "date_desc"` shortcut.

## Draft and send examples

Draft (`body.body` string):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "contractor@example.com",
    "from": "ops@mermail.app",
    "subject": "W-9 needed before we can issue your 1099",
    "body": "<p>Please reply with a completed Form W-9 attached. Do not type your TIN in the email body.</p>"
  }
}
```

Approved send (`body.text` and/or `body.html`):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "w9-request-2026-09-15-a1",
  "body": {
    "to": "contractor@example.com",
    "from": "ops@mermail.app",
    "subject": "W-9 needed before we can issue your 1099",
    "text": "Please reply with a completed Form W-9 attached. Do not type your TIN in the email body."
  }
}
```
