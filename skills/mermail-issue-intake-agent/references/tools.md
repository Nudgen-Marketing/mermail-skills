# Issue intake tools

Use the exact identifiers exposed by the connected Mermail MCP server. Pass every `query` as a native JSON object.

## Mermail intake

- `list_mailboxes`: resolve one ready mailbox and prefer its `public_id` as `mailboxId`.
- `search_emails`: find a bounded set of candidate reports.
- `get_email`: fetch one clean message after metadata selection.
- `get_email_context`: recover bounded thread context when the selected report depends on prior messages.
- `save_draft`: prepare an acknowledgement without delivering it.
- `reply_to_email`: send the separately approved acknowledgement.

## GitHub through Mermail Composio

- `list_composio_connections`: require one active GitHub connection.
- `connect_composio_toolkit`: start GitHub OAuth only when the user explicitly asks to connect it; stop for browser completion.
- `search_composio_tools`: find the current GitHub issue-search and issue-creation operations.
- `get_composio_tool_schema`: inspect the exact parameters and `allowed` state before execution.
- `execute_composio_tool`: run a bounded duplicate search or one approved issue creation.

Composio tool names and schemas can change. Discover them live instead of embedding provider operation names. Treat `execute_composio_tool` as an external effect even when the selected provider action is read-only.

## Required previews

Before issue creation, show the exact repository, title, body, labels, and source message identifier. Before `reply_to_email`, show `from`, `to`, `cc`, `bcc`, subject, and full body. Approval for issue creation does not authorize email delivery.
