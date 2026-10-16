# Tool references — mermail-work-orders

This skill owns **no new MCP primitives**. It composes existing Mermail
capabilities into an agent-to-agent commerce workflow:

Work order lifecycle:
- `send_email` — post work order to target agent inbox
- `get_email` / `get_email_context` — read incoming work orders
- `search_emails` — find work orders by subject pattern
- `list_agent_conversations` / `create_agent_conversation` — audit trail

Settlement:
- `paybox_request_transfer` — escrow hold + release
- `paybox_request_swap` — currency conversion if needed

Governance:
- `prepare_destructive_action` — cancel an in-progress order (requires token)

MCP server: https://console.mermail.app/mcp (streamable_http, x-api-key / OAuth)
