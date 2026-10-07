# Mermail Inbox Auditor — Tools

This skill uses the Mermail MCP server. Connect via Streamable HTTP:

```
https://console.mermail.app/mcp
```

For mailbox-only work, use the least-privilege profile:

```
https://console.mermail.app/mcp?profile=agent-inbox
```

## Authentication

- Interactive hosts (Claude, Cursor, Codex, OpenClaw, Hermes): MCP OAuth (browser consent, no key in config).
- Headless/CLI: API key via `MERMAIL_API_KEY` → `x-api-key` header. PayBox/wallet is unavailable in API-key mode.

## Mailbox tools (agent-inbox profile)

| Tool | Purpose |
|---|---|
| `list_workspaces` | Resolve the credential-bound workspace |
| `list_mailboxes` | List available mailboxes |
| `create_mailbox` | Provision a new mailbox (10 credits) |
| `search_emails` | Find messages by sender, subject, query, date window |
| `list_emails` | Newest-first listing (metadata-only in agent-inbox profile) |
| `get_email` | Fetch a single message (metadata-only or bounded content) |
| `get_email_context` | Load thread context after a message is selected |

## Wallet tools (full MCP profile, OAuth only)

| Tool | Purpose |
|---|---|
| `wallet:read` | View delegated balances and transaction history |
| `wallet:transact` | Transfer, swap, or pay a selected x402 resource |
| `paybox_*` | PayBox live tools and signing UI |

## CLI (deterministic, API key)

```bash
export MERMAIL_API_KEY="sk-proj-..."
mermail list-mailboxes
mermail search-emails --query "receipt" --date-start 2025-09-01
mermail get-email --id <message_id>
```

## Notes

- The `agent-inbox` profile exposes exactly 12 tools for mailbox discovery, bounded search, one message read, and bounded thread context.
- Wallet tools require the full `/mcp` catalog and OAuth (PayBox is unavailable with an API key).
- Verify the connection: `node skills/mermail-mcp/scripts/check-connection.mjs` → "Connected to mermail; discovered 72 tools (full profile)."
