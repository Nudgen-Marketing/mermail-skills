# Tools Reference for Mermail Bounty Settler

This workflow coordinates between Mermail Agent Inbox, Composition, and Agent Wallet PayBox tools.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use exact tool identifiers exposed by the host.
- Prefer mailbox `public_id` as `mailboxId` when list tools return it.
- Never call PayBox tools without explicit user confirmation of the exact recipient, asset, and amount.

## Tool Summary

| Tool | Domain | Purpose | Risk |
| --- | --- | --- | --- |
| `list_emails` | Inbox | Discovers unread milestone claims and bounty deliverables | Read-only |
| `get_email` | Inbox | Reads full submission body and sender authentication metadata | Read-only |
| `search_emails` | Inbox | Searches for specific milestone references or PR numbers | Read-only |
| `save_draft` | Compose | Drafts cryptographic receipt and milestone verification response | Read / Safe write |
| `reply_to_email` | Compose | Transmits verifiable settlement receipt to contributor | External-effect |
| `get_paybox_connection` | PayBox | Verifies Agent Wallet status and connected network | Read-only |
| `paybox_get_portfolio` | PayBox | Queries available token balances (USDC, SOL, USD) | Read-only |
| `paybox_request_transfer` | PayBox | Executes bounded on-chain or fiat milestone payout | External-effect / Value transfer |

## Argument Shapes

Always pass native JSON objects:

```json
{
  "query": {
    "folder": "inbox",
    "unreadOnly": true
  }
}
```

Do not pass stringified JSON blobs.
