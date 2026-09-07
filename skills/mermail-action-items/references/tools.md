# Action-items tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready mailbox |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Bounded candidate discovery |
| `get_email` / `get_email_context` / `get_thread` | `mermail-manage-inbox` | Scan-gated body/thread reads |

Newest metadata example:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 15,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Body read example:

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

## Drafts and optional organization

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Digest or nudge draft (`body.body` string) |
| `reply_to_email` | `mermail-compose-email` | Approved nudge only (exact preview) |
| `list_folders` / `create_folder` | `mermail-manage-inbox` | Optional Waiting folder |
| `move_email` / `bulk_move_emails` | `mermail-manage-inbox` | Optional organize after approval |
| `update_email` / `bulk_mark_emails_read` | `mermail-manage-inbox` | Optional read/star after digest |

Do not use Gmail/Outlook Composio. Do not call PayBox tools. Do not call `set_default_task_triager`.
