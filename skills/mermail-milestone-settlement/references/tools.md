# Milestone settlement agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving grants/bounty mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` / `get_email_context` | `mermail-manage-inbox` | Bounded untrusted milestone submission reads |
| `download_attachment` | `mermail-manage-inbox` | Inspect invoices, code audit reports, or milestone completion artifacts |
| `save_draft` | `mermail-compose-email` | Internal settlement confirmation draft (`body.body` string) |
| `reply_to_email` / `send_email` | `mermail-compose-email` | Formal milestone approval or review response send (`body.from` + `body.html` and/or `body.text`) |
| `create_custom_label` / `update_email` | `mermail-manage-inbox` | Tag threads with settlement status (`milestone:verified`, `milestone:payout-proposed`) |

Send, reply, and forward nest fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`.

## Agent Wallet and PayBox

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Initial PayBox connection and active account probe (must call once) |
| `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Verify treasury liquidity across chains (Solana, Base, Ethereum) before proposing disbursement |
| `create_agent_wallet_transfer_proposal` | `mermail-agent-wallet` | Create a reviewable on-chain transfer proposal for workspace owner signing |
| `paybox_request_transfer` | `mermail-agent-wallet` | Request direct milestone payout transfer through member-accessible PayBox flow |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile pending transfer status; never auto-retry |

Do not call `prepare_destructive_action` for PayBox or Agent Wallet proposal tools; PayBox owns approval and signing policies.

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
