---
name: mermail-mcp
description: Configure, verify, and troubleshoot the hosted Mermail MCP server in Codex, Claude Code, Cursor, or another MCP client. Use when installing Mermail, setting MERMAIL_API_KEY, mapping x-api-key authentication, checking connection status, diagnosing 401 or revoked-key errors, or confirming tool discovery.
---

# Connect Mermail MCP

Configure the hosted Streamable HTTP server without storing credentials in project files. Read [platforms.md](references/platforms.md) for the exact client format.

## Setup

1. Create an API key in Mermail workspace settings and copy it once.
2. Store it as `MERMAIL_API_KEY` in the platform's secret environment. Never ask the user to paste it into chat.
3. Configure `https://console.mermail.app/mcp` and map the environment variable to the `x-api-key` header using the platform-specific syntax.
4. Restart or reload the client so its desktop process receives the environment variable.
5. Run `node scripts/check-connection.mjs` from this skill directory, or inspect the server with the client's MCP status command.
6. Confirm that initialization succeeds and exactly 63 tools are discoverable.

## Troubleshoot

- Missing environment variable: set `MERMAIL_API_KEY` in the environment that launches the client, then restart it.
- `401`: check that the header is named `x-api-key`, the key starts with `sk-proj-`, and the key is not revoked.
- `403`: use a key bound to the requested workspace and verify permissions.
- `402`: verify Developer-plan access and remaining credits.
- `429`: wait for the RPM window; do not rotate keys to bypass limits.
- Tool mismatch: refresh the plugin and compare against the production server card.

Do not print the key, write it into tracked JSON, or use command-line arguments that may persist in shell history.
