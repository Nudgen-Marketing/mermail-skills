# Receipt ledger tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox, mail, labels, and folders

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (user-authorized) |
| `list_emails` / `search_emails` / `get_email` / `get_email_context` / `get_thread` | `mermail-manage-inbox` | Bounded untrusted receipt reads |
| `download_attachment` | `mermail-manage-inbox` | Optional PDF/body attachment after clean scan + user ask |
| `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` | Receipt label definitions |
| `list_folders` / `create_folder` | `mermail-manage-inbox` | Receipt filing folders |
| `move_email` / `bulk_move_emails` | `mermail-manage-inbox` | File confirmed receipt mail |
| `save_draft` | `mermail-compose-email` | Owner digest draft (`body.body` string) |
| `send_email` / `forward_email` | `mermail-compose-email` | Approved digest delivery only |

Send and forward nest Sold fields under `body`. MCP does not auto-fill Reply All.

## Optional PayBox reads (full-profile OAuth only)

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox action when user asks for wallet context |
| `paybox_get_portfolio` / `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Read-only holdings context |
| `paybox_list_credentials` | `mermail-agent-wallet` | Credential discovery for portfolio reads when needed |

API keys never unlock Agent Wallet. Do not call `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `paybox_use_plugin`, or legacy wallet submit/reject tools from this skill.

## Examples

Search (illustrative shape — use exact schema from live `tools/list`):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "text": "receipt OR invoice OR billing OR payment confirmation",
    "limit": 25
  }
}
```

Owner digest draft:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "body": "Receipt ledger summary (draft)\n\n- Vendor A — 2026-09-20 — 12.00 USD — invoice — email id …"
  }
}
```
