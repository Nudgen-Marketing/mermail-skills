# Tools

Use exact Mermail MCP tool names from the live `tools/list` (hosts may qualify them).

Typical mail tools:

- List/get mailboxes — prefer `public_id` as `mailboxId`
- Compose / draft / send (external effect) — exact preview + user approval before send
- Thread read tools for reply context only

URI construction is local string formatting. **Do not** call PayBox / Agent Wallet spend tools from this skill.

MCP server: `https://console.mermail.app/mcp`
