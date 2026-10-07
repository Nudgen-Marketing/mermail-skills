# Invoice Settlement Agent Tools

This composite workflow uses tools owned by official Mermail inbox, email composition, and Agent Wallet skills. Do not claim or duplicate ownership in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Prefer mailbox `public_id` as `mailboxId`.

## Tool Mapping

| Domain | Tool | Owner | Role |
| --- | --- | --- | --- |
| Workspace | `list_mailboxes` | `mermail-administer-workspace` | Discover mailbox context and resolve `mailboxId` |
| Inbox Discovery | `list_emails` | `mermail-manage-inbox` | List recent incoming candidate invoices (`folder: "inbox"`, `agent_safe_content: true`) |
| Inbox Discovery | `get_email` | `mermail-manage-inbox` | Inspect candidate invoice content with `require_scan_status: "clean"`, `agent_safe_content: true` |
| Inbox Discovery | `get_email_context` | `mermail-manage-inbox` | Retrieve conversation thread context when historical PO agreements exist |
| Email State | `update_email` | `mermail-manage-inbox` | Mark settled invoice emails as read/starred or move to archive |
| Email Composition | `send_email` | `mermail-compose-email` | Issue a structured outgoing invoice to a counterparty agent |
| Email Composition | `reply_to_email` | `mermail-compose-email` | Dispatch cryptographically attested payment receipt to invoicing agent |
| Agent Wallet | `get_paybox_connection` | `mermail-agent-wallet` | Verify active PayBox OAuth connection before payment attempts |
| Agent Wallet | `paybox_get_portfolio` | `mermail-agent-wallet` | Inspect token balances (Circle USDC, SOL, ETH) to ensure sufficient settlement funds |
| Agent Wallet | `paybox_request_transfer` | `mermail-agent-wallet` | Execute on-chain transfer to recipient address; returns `request_id` and `signing_handoff` |
| Agent Wallet | `paybox_get_request` | `mermail-agent-wallet` | Poll settlement status for a specific `request_id` (terminal status: `settled` / `failed`) |

## Native MCP Calling Conventions

Do not call `prepare_destructive_action` for `paybox_*` tools. PayBox handles signing and authority natively.

When `paybox_request_transfer` returns `pending_signature`:
- Present the returned `signing_handoff.console_url` to the workspace owner.
- Never invent secondary confirmation modals or replace the transfer with a legacy proposal.
- Once signed, reconcile terminal status with a single call to `paybox_get_request(requestId)`.
