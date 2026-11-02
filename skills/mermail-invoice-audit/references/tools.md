# Tools

Exact Mermail MCP tools this skill uses. This skill owns no tools — it only
recombines existing read + draft/label tools from the catalog. Keep ownership
unique in `tool-coverage.json` (owner remains the focused skill for each tool).

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object
  into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example
  `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not
  manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_mailboxes` | Resolve the audit mailbox | read |
| `list_emails` / `search_emails` | Find invoice / payment-claim mail | read |
| `get_email` / `get_thread` | Read invoice bodies for claim extraction | read |
| `get_paybox_connection` | First wallet action: probe PayBox state | read |
| `get_agent_wallet_portfolio` | Balances and recent activity for the window | read |
| `paybox_get_request` | Fetch a transfer/swap request's details | read |
| `save_draft` | Draft audit summary to the human owner | write-preview |
| `create_custom_label` | Label audited mail `Invoice-Audit-YYYY-MM` | write-preview |
| `move_email` | Optionally move audited mail to a folder | write-preview |

This skill never calls `paybox_request_transfer`, `paybox_request_swap`,
`paybox_pay_x402`, `reply_to_email`, `send_email`, or `delete_email`.
