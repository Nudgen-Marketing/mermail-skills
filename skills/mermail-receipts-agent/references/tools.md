# Receipts agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `pay`, `remind`, `export_ledger`, or `close_invoice` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find billing mail | `list_emails`, `search_emails` (native JSON `query`) | `mermail-manage-inbox` |
| Read one document | `get_email`, `get_thread` | `mermail-manage-inbox` |
| Organize the ledger view | `list_custom_labels`, `create_custom_label`, `move_email` (user-approved) | `mermail-manage-inbox` |
| Draft a reminder/dispute | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send an approved follow-up | `reply_to_email` / `send_email` (explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Send later | `schedule_email_send` (`scheduled_send_at` ISO-8601 UTC), only after approval | `mermail-compose-email` |
| Export outside Mermail | not provided here; propose a user-approved companion flow | n/a |

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready billing mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `get_email_usage` / `get_api_credit_usage` | `mermail-administer-workspace` | Check budget before wide scans |

Ledger aggregation happens in the agent, not in MCP. There is no server-side sum, filter-by-amount, or OCR tool; amounts and dates come from `get_email` content only.

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
