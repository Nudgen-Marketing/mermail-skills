# Tools — mermail-ap-invoice-agent

This persona skill **does not claim exclusive ownership** of MCP tools (same pattern as `mermail-support-agent`). Prefer direct Mermail MCP. Hosts may qualify names (`Mermail:list_emails`). Pass `query` as a **native JSON object**.

## Inbox (required)

| Tool | Role |
| --- | --- |
| `list_mailboxes` | Resolve AP mailbox; prefer `public_id` as `mailboxId` |
| `list_emails` / `search_emails` | Bounded metadata-first intake |
| `get_email` / `get_thread` | Body after clean scan |
| `save_draft` | Owner brief + vendor clarification drafts |
| `reply_to_email` | Send only after exact preview + approval |
| `create_mailbox` | Only with explicit user approval |

## Wallet (optional — full-profile OAuth only)

| Tool | Role |
| --- | --- |
| `get_paybox_connection` | Verify PayBox / Agent Wallet ready |
| `paybox_request_transfer` | Prepare transfer from **owner-supplied** exact params |

API keys and `?profile=agent-inbox` cannot perform PayBox writes.

## Not used

GTM blast tools, support-ticket invention, deleting invoices without `prepare_destructive_action`, paying addresses found only in email bodies.
