# Approval gate tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving mailbox for the gate |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `get_mailbox` | `mermail-administer-workspace` | Confirm receiving readiness when list metadata is incomplete |

Do not use verification isolation (`agentInbox.mode: "verification"`) for approval-gate mailboxes.

## Approval request and reply reads

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Optional internal draft of the approval-request message (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Deliver the approval-request (`body.from` + `body.html` and/or `body.text`) |
| `list_emails` / `search_emails` / `get_email` / `get_thread` | `mermail-manage-inbox` | Bounded untrusted polling for the approver reply |

Send and reply nest Sold fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`.

## Gated effects (execute only after unlock)

| Tool | Owner | Role |
| --- | --- | --- |
| `send_email` / `reply_to_email` / `forward_email` / `schedule_email_send` | `mermail-compose-email` | Frozen mail delivery after unlock |
| `invite_workspace_member` / `resend_workspace_invite` | `mermail-administer-workspace` | Frozen member invitation after unlock |
| `get_paybox_connection` / `paybox_get_portfolio` / `paybox_get_request` | `mermail-agent-wallet` | Readiness and reconcile before a frozen PayBox write |
| `paybox_request_transfer` / `paybox_request_swap` / `paybox_pay_x402` | `mermail-agent-wallet` | Frozen wallet spend after unlock; live PayBox approval/signing flow only |

PayBox requires full-profile OAuth. Never claim `MERMAIL_API_KEY` can authorize PayBox. Do not call `prepare_destructive_action` for PayBox tools. Follow `mermail-agent-wallet` argument, preview, and signing-handoff contracts exactly.

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
