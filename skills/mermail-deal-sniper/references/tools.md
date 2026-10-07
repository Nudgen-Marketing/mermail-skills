# Deal sniper tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox, mail, and labels

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the active receiving mailbox |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted opportunity reads |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | Organize leads into qualified folders/labels |
| `save_draft` | `mermail-compose-email` | Create review-ready proposal drafts (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved proposal send after human confirmation |

## Draft-only triage

| Tool | Owner | Role |
| --- | --- | --- |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect existing triager rules |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Opportunity detection and auto-draft only |
| `delete_task_triager` | `mermail-automate-triage` | Destructive; requires `prepare_destructive_action` |

Do not call `set_default_task_triager`.
