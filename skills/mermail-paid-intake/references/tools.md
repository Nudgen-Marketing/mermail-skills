# Paid intake tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `intake`, `collect_payment`, `invoice`, or `settle` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

PayBox tools appear only on full-profile MCP **OAuth**. **Always** `tools/call` `get_paybox_connection` once before claiming PayBox tools are unavailable. Absence from `tools/list` is not "not exposed." Follow `mermail-agent-wallet` contracts for any `paybox_*` call.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Read a brief | `list_emails`, `search_emails`, `get_email`, `get_thread` | `mermail-manage-inbox` |
| Check PayBox connection | `get_paybox_connection` | `mermail-agent-wallet` |
| Inspect holdings | `get_agent_wallet`, `paybox_get_portfolio` | `mermail-agent-wallet` |
| Reconcile a user-named payment | `paybox_get_request` | `mermail-agent-wallet` |
| Draft a reply | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Deliver / ask for payment in-thread | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Close / follow up | `create_custom_label` or `move_email` | `mermail-manage-inbox` |
| Pay a user-selected x402 resource | `paybox_pay_x402` (only with independent user authorization) | `mermail-agent-wallet` / `mermail-x402-agent` |

## Mailbox

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready intake mailbox |

Do not call `set_default_task_triager`. MCP does not auto-fill Reply All. Do not call `prepare_destructive_action` for `paybox_*` tools.

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
