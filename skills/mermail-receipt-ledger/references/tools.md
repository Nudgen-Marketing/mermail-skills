# Receipt ledger tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the inbox to read |
| `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted receipt reads |
| `save_draft` | `mermail-compose-email` | Optional summary draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Approved summary send to a user-named address |

Send nests Sold fields under `body`. Do not invent wallet tools.
