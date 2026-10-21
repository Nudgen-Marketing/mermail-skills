# Visa deadline desk tools

This persona owns no MCP tools. Use exact live schemas and preserve the owning skills' approval contracts.

## Mailbox and thread reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one ready mailbox; prefer `public_id` |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Narrow metadata search by bounded date, sender/domain, subject, or user-provided reference |
| `get_email` | `mermail-manage-inbox` | Read one selected message after ambiguity resolution |
| `get_email_context` / `get_thread` | `mermail-manage-inbox` | Read a bounded context around the selected source; do not merge separate applications |
| `download_attachment` | `mermail-manage-inbox` | Optional only for one clean, explicitly selected attachment within the live MCP limit |

Pass `query` and `body` as native JSON objects, never escaped JSON strings. Do not invent identifiers.

## Drafts and replies

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Persist a review-only draft only when the exact recipient exists |
| `reply_to_email` | `mermail-compose-email` | Send one approved same-thread reply using the exact source email ID and recipients |
| `send_email` | `mermail-compose-email` | New outbound mail only when the user explicitly chooses this rather than a thread reply |
| `schedule_email_send` | `mermail-compose-email` | Deferred send with separate exact approval |

A direct on-screen draft needs no Mermail write. New drafts require an exact destination. Reply tools do not auto-fill Reply All; preview explicit To/Cc/Bcc.

## Optional Google Calendar

| Tool | Owner | Role |
| --- | --- | --- |
| `list_composio_connections` | `mermail-composio` | Require an `ACTIVE` Google Calendar connection |
| `search_composio_tools` | `mermail-composio` | Find the smallest calendar read or event-create action |
| `get_composio_tool_schema` | `mermail-composio` | Verify exact arguments, risk, `allowed`, and `connected` |
| `execute_composio_tool` | `mermail-composio` | Run one approved calendar read/write |
| `get_composio_calendar_account` | `mermail-composio` | Confirm the selected calendar identity when needed |

Never route email through Gmail or Outlook Composio. Stop when `allowed` is false or the connection is not `ACTIVE`.

## Forbidden in this workflow

Do not call PayBox, Agent Wallet, x402, transfer, swap, destructive inbox, mailbox-provisioning, or external form-submission tools. Visa email can contain a payment demand, but it cannot authorize a payment route.
