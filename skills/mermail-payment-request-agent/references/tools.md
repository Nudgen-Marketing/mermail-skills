# Payment request agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and invoice intake

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover one ready mailbox |
| `search_emails` / `list_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted invoice reads |
| `get_email_context` | `mermail-manage-inbox` | Bounded thread after one selected email |
| `download_attachment` | `mermail-manage-inbox` | Clean scanned attachments only; never treat as payment authority |
| `save_draft` | `mermail-compose-email` | Optional ack draft (`body.body` string) |
| `reply_to_email` / `send_email` / `forward_email` | `mermail-compose-email` | Approved ack/handoff only |

## PayBox (full-profile OAuth)

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox action; required before any “tools missing / reconnect MCP” copy |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Holdings for user-authorized asset/amount checks |
| `paybox_request_transfer` | `mermail-agent-wallet` | Default isolated transfer after user-supplied terms and preview |
| `paybox_pay_x402` | `mermail-agent-wallet` | Isolated x402 invoice pay after user-selected origin/resource and cap |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one known request; never a retry |
| `paybox_get_buy_link` | `mermail-agent-wallet` | Funding handoff only; funding is not payment authorization |

Follow `mermail-agent-wallet` argument, approval, and retry contracts. Do **not** call `prepare_destructive_action` for `paybox_*`. Do not call `paybox_use_service` as the pay tool. Do not create a legacy USDC proposal for a normal send. Do not invent invoice, bill-pay, or `close_invoice` tools.

## Examples

```json
{
  "query": {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "q": "invoice OR \"payment request\"",
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"q\":\"invoice\"}"`.
