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
| File the source message | `list_folders`, then approved `move_email` with returned `folderId` | `mermail-manage-inbox` |
| Draft-only classifier | `list_task_triagers` / `create_task_triager` / `update_task_triager` | `mermail-automate-triage` |

Do not call `set_default_task_triager`. Do not call PayBox tools. Do not `reply_to_email` a marketplace unless the user approved an exact preview.

## Selected reads and filing

Resolve the credential-bound workspace and one exact mailbox before discovery.
Use finite bounds:40 metadata candidates,20 read calls and one selected body of
at most10,000 characters; stop on rate/auth/plan errors and disclose partial
coverage. Discovery uses `metadata_only:true` and `agent_safe_content:true`.
For the selected message call `get_email` with top-level `mailboxId`, `emailId`
and `query:{"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}`.
Do not give unknown-scan, withheld, unavailable or truncated content to the
extractor, or claim the heuristic parser authenticates a marketplace.

`create_custom_label` defines classifier rules; it cannot manually assign an
existing email. Immediate filing requires separately approved folder movement
using the returned folder ID; creating a missing folder requires distinct user
intent. If unavailable, leave the source untouched and report the limitation.

## List example

This example is `list_emails`; its sorting fields do not apply to
`search_emails`. Search uses native `query.from`, `query.to`, `query.query`,
`query.subject` and date bounds, then local ordering of the reviewed slice.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
