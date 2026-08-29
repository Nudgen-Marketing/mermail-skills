# Receipt digest tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier. Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready mailbox |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded receipt/invoice search |
| `get_email` | `mermail-manage-inbox` | Inspect one clean candidate |
| `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` | Optional future classifier definition |

## Draft

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Digest draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Only after exact preview + approval |

Do not call `delete_email`, PayBox, or Composio from this skill.

## Example search query

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 25
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
