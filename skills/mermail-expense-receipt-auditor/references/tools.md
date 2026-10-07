# Tool contract

Use only tool identifiers confirmed by the live Mermail MCP catalog.

Required read-only tools:

- `list_mailboxes`: resolve one exact mailbox.
- `search_emails`: bounded candidate discovery.
- `get_email`: inspect one selected candidate.

Optional when present:

- `list_emails`: bounded fallback discovery.
- `get_email_context`: bounded context only after a message is selected.

This companion skill intentionally owns no MCP tools and does not alter Mermail's official `tool-coverage.json`.

Pass structured query values as native JSON objects when the live schema expects an object. Do not stringify a JSON object.

Never invent a tool name or silently substitute a write-capable tool.
