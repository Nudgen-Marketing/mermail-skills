# Amoeba survival tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

For verification correlation, follow the same bounds and contracts as `mermail-agent-inbox`. For ordinary historical search/cleanup, follow `mermail-manage-inbox`. For drafts and sends, follow `mermail-compose-email`.

## Mailbox discovery and optional provision

| Tool | Owner | Role |
| --- | --- | --- |
| `list_workspaces` | `mermail-administer-workspace` | Resolve credential-bound workspace when required |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a survival/verification mailbox |
| `create_mailbox` | `mermail-administer-workspace` | One authorized provision when none fits (10 credits; follow agent-inbox settings when supported) |
| `get_mailbox` | `mermail-administer-workspace` | Confirm readiness (`can_receive`, receiving status) |

## Inbox reads (vitals context, deadlines, OTP)

| Tool | Owner | Role |
| --- | --- | --- |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Bounded untrusted reads; pass `query` as a native object |
| `get_email` / `get_email_context` | `mermail-manage-inbox` | Inspect one validated candidate; require `scan_status: clean` before body use |

## Drafts and approved sends

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Vitals digest, Judge receipt, deadline checklist (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Only after exact preview and fresh approval |

## Optional PayBox inspect (never pays)

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Connection status only when the user asks for wallet inspect |
| `paybox_get_portfolio` / `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Read-only holdings context for runway digests |

Do not call `paybox_pay_x402`, `paybox_request_transfer`, `paybox_request_swap`, or legacy wallet writes from this skill. Do not call `prepare_destructive_action` for PayBox tools.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 10
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
