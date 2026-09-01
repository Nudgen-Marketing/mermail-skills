# Eval briefing agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `run_bench`, `score_model`, or `post_eval` Mermail tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find eval mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Provision eval mailbox | `create_mailbox` (`email` + `name`, 10 credits, user-authorized) | `mermail-administer-workspace` |
| Find the inbound question | `list_emails`, `search_emails`, `get_email`, `get_thread` | `mermail-manage-inbox` |
| Draft the briefing | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send / reply with the briefing | `reply_to_email` or `send_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Handoff to a human | `forward_email` | `mermail-compose-email` |
| File the thread | `create_custom_label` or `move_email` | `mermail-manage-inbox` |
| Paid hosted bench | `paybox_pay_x402` then continue — **route to** `mermail-x402-agent` | `mermail-x402-agent` / `mermail-agent-wallet` |
| Local measurement | host shell / local harness; not a Mermail MCP tool | client, not MCP |

Do not call `set_default_task_triager`. MCP does not auto-fill Reply All. Do not invent a `bench` tool on the Mermail server.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready eval mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits |
| `list_emails` / `search_emails` / `get_email` / `get_thread` | `mermail-manage-inbox` | Bounded untrusted reads |
| `save_draft` | `mermail-compose-email` | Briefing draft |
| `send_email` / `reply_to_email` / `forward_email` | `mermail-compose-email` | Approved send/reply/handoff |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | `eval-go` / `eval-nogo` / `eval-needs-hw` |
| `get_paybox_connection` | `mermail-agent-wallet` | Only if user independently asked to pay a bench |

## Examples

List newest mail in the eval mailbox:

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

Approved reply:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "idempotencyKey": "eval-briefing-2026-08-29-a1",
  "body": {
    "to": "requester@example.com",
    "from": "eval@mermail.app",
    "text": "Verdict: no-go for interactive OLMoE-1B-7B Q4 on 2.7 GiB. Measured 0.114 tok/s with kernel page-cache offload; compute ceiling on this box is ~2.0 tok/s."
  }
}
```
