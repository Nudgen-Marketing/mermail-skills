# Tools

This skill does not own MCP tools. Use Mermail mailbox tools already covered by `mermail` / `mermail-compose-email`:

- List/resolve mailboxes (`list_mailboxes`, get mailbox) — prefer `public_id` as `mailboxId`
- Draft/compose/send email tools exposed by the connected Mermail MCP server

Do not call PayBox `paybox_*` tools from this skill. Do not invent tool names.

URI construction is local string formatting (see workflows.md). Optional public balance verification after payment can use any read-only Base RPC eth_call against native USDC — never requires Mermail.
