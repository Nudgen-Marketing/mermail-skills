# Agent Handshake tool contracts

This persona composes existing capabilities. It adds no payment transfer, invoice issuance, or financial execution tools to Mermail's catalog.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Composed tools

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover buyer mailbox and inspect configuration |
| `list_emails` | `mermail-manage-inbox` | Bounded polling for incoming vendor replies |
| `get_email` | `mermail-manage-inbox` | Retrieve message content and extract vendor quotes |
| `send_email` | `mermail-compose-email` | Dispatch opening bids, counter-proposals, walk-away notices, and audit transcripts |
| `reply_to_email` | `mermail-compose-email` | Reply within active vendor negotiation thread |
| `get_paybox_connection` | `mermail-agent-wallet` | Read-only check verifying Paybox status is `ACTIVE` before halting |

## Excluded tools and financial safety

- All fund transfer tools (`paybox_request_transfer`, `paybox_transfer`, `paybox_pay_x402`, `submit_agent_wallet_transfer`) are intentionally excluded.
- The agent halts immediately upon agreement and wallet verification. Fund transfers remain strictly under manual human control.

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