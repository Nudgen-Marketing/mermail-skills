# Tools

This skill uses both Mermail Wallet and Mermail Inbox MCP tools.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field.
- Use the exact tool identifier exposed by the current host. Do not manually add, strip, or invent prefixes.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Wallet Tools

| Tool | Purpose | Risk |
| --- | --- | --- |
| `get_wallet` | Retrieve the Agent Wallet address and SOL balance | read |
| `get_token_accounts` | List all SPL token accounts with balances and mint info | read |
| `get_token_metadata` | Fetch on-chain metadata for a specific token mint | read |

## Inbox Tools

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace | read |
| `list_mailboxes` | Discover existing mailboxes for report delivery | read |
| `send_email` | Deliver the security report to a recipient | external-effect |
| `compose_email` | Draft the report email before sending | read |

## Examples

### Fetching token accounts
```json
{
  "walletId": "agent-wallet"
}
```

### Sending the report
```json
{
  "mailboxId": "mbx_public_id",
  "to": "user@example.com",
  "subject": "Wallet Security Report — 2026-09-12 — 2 suspicious tokens found",
  "body": "..."
}
```

Do not pass `"to": "{\"address\":\"user@example.com\"}"`.
