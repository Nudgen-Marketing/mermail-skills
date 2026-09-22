# Invoice settlement agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the designated finance or accounts payable mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` / `get_thread` | `mermail-manage-inbox` | Bounded untrusted invoice email and thread reads |
| `download_attachment` | `mermail-manage-inbox` | Retrieve invoice attachment PDF or structured payload (subject to 1 MiB MCP boundary) |
| `list_folders` / `move_email` | `mermail-manage-inbox` | Move settled invoices to Invoices/Settled or Invoices/Pending folders |
| `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` | Tag emails with status labels (`Invoice/Pending-Approval`, `Invoice/Settled`) |
| `save_draft` | `mermail-compose-email` | Draft payment confirmation or clarification reply (`body.body` string) |
| `reply_to_email` | `mermail-compose-email` | Customer-facing payment confirmation send with transaction reference |

Send and reply nest mail fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`.

## Agent Wallet and PayBox

| Tool | Owner | Role |
| --- | --- | --- |
| `get_agent_wallet` | `mermail-agent-wallet` | Inspect agent wallet public address and network |
| `get_agent_wallet_portfolio` / `paybox_get_portfolio` | `mermail-agent-wallet` | Check current token balances (USDC, SOL) before proposing transfer |
| `create_agent_wallet_transfer_proposal` | `mermail-agent-wallet` | Create a transparent transfer proposal with exact amount and recipient address for human approval |
| `paybox_request_transfer` | `mermail-agent-wallet` | Request PayBox wallet transfer with user signing link |
| `paybox_pay_x402` | `mermail-agent-wallet` | Settle machine-payable HTTP 402 invoice URLs under verified user budget |

Never execute unapproved transfers. All wallet writes require human approval and signing handoff.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "search": "Invoice",
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
