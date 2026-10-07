# Hospitality reservation desk tools

This skill **orchestrates tools owned by other official skills**. Do not assign these tools to this skill in `tool-coverage.json`.

Pass structured arguments as native JSON objects. Never stringify MCP `query` or provider `arguments`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve a ready venue mailbox when needed |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded reservation or waitlist discovery |
| `get_email` / `get_thread` | `mermail-manage-inbox` | Read the selected untrusted request and thread context |
| `save_draft` | `mermail-compose-email` | Prepare an internal review draft |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved guest confirmation, clarification, or waitlist offer |

Do not invent a guest address. Use the address from the selected authoritative thread or an independently user-supplied address.

## Google Calendar through Composio

| Tool | Owner | Role |
| --- | --- | --- |
| `list_composio_toolkits` / `list_composio_connections` | `mermail-composio` | Require an ACTIVE `googlecalendar` connection |
| `get_composio_calendar_account` | `mermail-composio` | Identify the connected account when needed |
| `search_composio_tools` / `get_composio_tool_schema` | `mermail-composio` | Discover the exact allowed read/write action and schema |
| `execute_composio_tool` | `mermail-composio` | Bounded free/busy or event read; approved create/update/cancel write |

Use only exact provider slugs returned by tool discovery. Do not invent Google Calendar action names.

## Provider writes

Calendar create, update, or cancellation uses `execute_composio_tool` and therefore follows the owning Composio external-effect contract:

1. discover exact action and schema
2. show exact target/calendar/event plus arguments
3. obtain fresh approval
4. execute once
5. inspect authoritative state once if the result is uncertain

Do not use `prepare_destructive_action` unless the owning Mermail contract classifies the actual Mermail tool as destructive. Do not manufacture a confirmation-token flow for provider actions that are exposed through `execute_composio_tool`.
