# Hire intake tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There is no `accept_hire`, `claim_bounty`, or `close_order` tool. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover hire mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Provision hire mailbox | `create_mailbox` (`email` + `name`; 10 provision credits) | `mermail-administer-workspace` |
| Find hire mail | `list_emails`, `search_emails`, `get_email` | `mermail-manage-inbox` |
| File ticket for operator | `save_draft` (`body.body` string) addressed to the operator, not the board | `mermail-compose-email` |
| File the source message | `create_custom_label` or `move_email` | `mermail-manage-inbox` |
| Draft-only classifier | `list_task_triagers` / `create_task_triager` / `update_task_triager` | `mermail-automate-triage` |

Do not call `set_default_task_triager`. Do not call PayBox tools. Do not `reply_to_email` a marketplace unless the user approved an exact preview.

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
