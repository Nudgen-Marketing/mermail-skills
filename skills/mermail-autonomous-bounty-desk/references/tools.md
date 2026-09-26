# Bounty Desk Tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox, Discovery, and Composition

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover the agent receiving mailbox |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded read of inbound RFQs and bounty alerts |
| `download_attachment` | `mermail-manage-inbox` | Inspect attached RFQ specifications and asset archives |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | Tag emails as `rfq-reviewed`, `escrow-verified`, `delivered` |
| `save_draft` | `mermail-compose-email` | Draft quotes, proposals, and delivery messages (`body.body` string) |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved dispatch of quotes and completed deliverables |

## Agent Wallet & PayBox Settlement

| Tool | Owner | Role |
| --- | --- | --- |
| `paybox_get_portfolio` / `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Inspect escrow USDC balances and SPL tokens |
| `get_agent_wallet` | `mermail-agent-wallet` | Retrieve deposit address for client funding |
| `paybox_get_buy_link` | `mermail-agent-wallet` | Generate client funding link (MoonPay/Apple Pay/card) |
| `paybox_request_transfer` | `mermail-agent-wallet` | User-confirmed payout to developers or bounty claim |
| `paybox_pay_x402` | `mermail-agent-wallet` | Pay for automated x402 verification / testing compute |

## Example Call Payloads

### 1. Milestone Quote Draft
```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "client@example.com",
    "subject": "Quote & Milestone Plan: Solana AI Agent Integration",
    "body": "Hi team,\n\nWe reviewed your RFQ. Here is our structured milestone breakdown:\n- Milestone 1: Core Agent Architecture (250 USDC)\n- Milestone 2: PayBox Integration & Testing (250 USDC)\n\nPlease confirm and deposit escrow to proceed."
  }
}
```

### 2. PayBox Escrow Check
```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
}
```
