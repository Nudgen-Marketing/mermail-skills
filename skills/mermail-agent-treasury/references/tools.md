# Treasury agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`. Do not invent MCP tool names.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

PayBox tools appear only on full-profile MCP **OAuth**. API keys and the agent-inbox profile never expose them. **Always** `tools/call` `get_paybox_connection` once before claiming PayBox tools are unavailable or asking to reconnect MCP.

## Mailbox and inbound mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready treasury mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted invoice, payout, and claim-code reads |
| `get_email_context` | `mermail-manage-inbox` | Bounded thread context after one message is selected |
| `download_attachment` | `mermail-manage-inbox` | Metadata-first invoice attachment; never execute it |

For an active third-party claim or payout identity flow, keep expected-message correlation on `mermail-agent-inbox` rather than duplicating that workflow here.

## Payments (Agent Wallet / x402)

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox action; `connect_handoff` / `reauth_handoff` / `OWNER_ACTION_REQUIRED` |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Holdings for spend-cap and reserve checks |
| `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Owner-only legacy/fallback portfolio read |
| `paybox_request_transfer` | `mermail-agent-wallet` | User-authorized catalog transfer after cap and reserve pass |
| `paybox_pay_x402` | `mermail-agent-wallet` | Isolated user-selected x402 payment; pay-then-continue stays on `mermail-x402-agent` |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one known request after signing or when status is asked |

Keep PayBox argument, approval, retry, and signing contracts on `mermail-agent-wallet`. Do not call `prepare_destructive_action` for `paybox_*`. Never substitute `paybox_use_service` as a pay call. Never call `reopen_signing_window` / `paybox_reopen_signing_window` from the model.

## Receipts

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Receipt draft for review (`body.body` string) |
| `send_email` | `mermail-compose-email` | One authorized receipt after terminal PayBox success (`body.from` + `html`/`text`) |

Send nests fields under `body`. One idempotency key per approved send. Do not send from a triager run.

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

Do not pass `"query": "{"sortColumn":"date"}"`.
