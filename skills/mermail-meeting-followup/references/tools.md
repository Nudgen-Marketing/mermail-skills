# Meeting follow-up tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `extract_minutes`, `track_action_item`, or `send_followup` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Locate the meeting thread | `search_emails` with a bounded query (subject keyword, date window, sender) | `mermail-manage-inbox` |
| Read the thread | `get_thread`, or `get_email` + `get_email_context` for bounded context | `mermail-manage-inbox` |
| Draft the recap follow-up | `save_draft` (`body.body` string) in the thread | `mermail-compose-email` |
| Send the approved follow-up | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Deliver the recap to a named human outside the thread | `forward_email` to that recipient | `mermail-compose-email` |

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the mailbox that received the meeting mail |

Do not create, label, move, or delete mail from this workflow.

## Examples

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
