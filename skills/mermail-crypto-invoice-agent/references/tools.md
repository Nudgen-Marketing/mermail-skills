# Crypto Invoice Agent Tools

This workflow utilizes official Mermail MCP tools for mailbox discovery, draft creation, email delivery, thread correlation, and PayBox wallet connectivity.

## Mailbox & Communication Tools

| Tool | Owner | Role in Invoicing Workflow |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discovers available sending mailboxes; retrieves `public_id` and mailbox email. |
| `save_draft` | `mermail-compose-email` | Creates an editable invoice draft for human operator review before delivery. |
| `send_email` | `mermail-compose-email` | Sends finalized invoices or payment receipts to clients with proper `to`, `subject`, and formatting. |
| `search_threads` | `mermail-manage-inbox` | Searches inbox threads by invoice number (e.g. `query: "INV-2026-0042"`) to find customer responses. |
| `get_thread` | `mermail-manage-inbox` | Retrieves full email thread messages to extract customer transaction hashes and payment notices. |

## PayBox / Agent Wallet Tools

| Tool | Owner | Role in Invoicing Workflow |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Checks status of connected agent wallet, receiving addresses, and active payment listeners. |
| `paybox_pay_x402` | `mermail-agent-wallet` | Executes or validates x402 payment requirements against signed invoices. |
