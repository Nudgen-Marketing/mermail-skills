# Tools reference

This skill orchestrates mailbox intake, cryptographic audit, wallet settlement, and receipt delivery across official Mermail MCP tools.

## Conventions

- Pass structured arguments as native JSON objects. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when list tools return it.
- Wallet writes require active PayBox connection and full-profile OAuth.

## Tool catalog

| Tool | Domain | Purpose | Risk |
| --- | --- | --- | --- |
| `list_emails` | Inbox | Find invoice emails by folder, label, or date window | Read |
| `get_email` | Inbox | Retrieve full email body and attachment metadata | Read |
| `get_email_context` | Inbox | Inspect sender authentication and thread history | Read |
| `search_emails` | Inbox | Locate past invoices or duplicate invoice identifiers | Read |
| `update_email` | Inbox | Apply labels such as `invoice-pending` or `invoice-paid` | Reversible write |
| `get_paybox_connection` | Wallet | Confirm PayBox connection status and signing mode | Read |
| `get_agent_wallet_portfolio` | Wallet | Inspect token balances before proposing settlement | Read |
| `paybox_request_transfer` | Wallet | Create a signed transfer request to vendor address | Wallet write |
| `create_agent_wallet_transfer_proposal` | Wallet | Generate a formal on-chain transfer proposal | Wallet write |
| `send_email` | Compose | Send payment receipt with transaction hash to vendor | External effect |
| `reply_to_email` | Compose | Reply on the invoice thread confirming settlement | External effect |
| `save_draft` | Compose | Save payment acknowledgement for human review | Reversible write |

## Query conventions

When querying emails for vendor invoices, always supply `query` as a native JSON object:

```json
{
  "mailboxId": "mb_live_abc123",
  "query": {
    "folder": "inbox",
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 20
  }
}
```

Never pass `"query": "{\"folder\":\"inbox\"}"`.
