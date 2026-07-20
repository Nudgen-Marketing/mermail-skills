---
name: mermail-mcp
description: Configure, verify, and troubleshoot the hosted Mermail MCP server in Codex, Claude Code, Cursor, or another MCP client. Use when installing Mermail, setting MERMAIL_API_KEY, mapping x-api-key authentication, checking connection status, diagnosing 401 or revoked-key errors, or confirming tool discovery.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🔌"
---

# Connect Mermail MCP

Configure the hosted Streamable HTTP server without storing credentials in project files. Read [platforms.md](references/platforms.md) for the exact client format.

## Setup

1. Prefer **MCP OAuth** when the client supports it: connect to `https://console.mermail.app/mcp`, complete the browser login (same Enoki account as the Mermail console), and pick a workspace. No API key is required in that mode.
2. Otherwise create an API key in Mermail workspace settings and copy it once.
3. Store the key as `MERMAIL_API_KEY` in the platform's secret environment. Never ask the user to paste it into chat.
4. Configure `https://console.mermail.app/mcp` and map the environment variable to the `x-api-key` header using the platform-specific syntax.
5. Restart or reload the client so its desktop process receives the environment variable.
6. Run `node scripts/check-connection.mjs` from this skill directory, or inspect the server with the client's MCP status command.
7. Confirm that initialization succeeds and exactly 63 tools are discoverable.

## Troubleshoot

- Missing environment variable: set `MERMAIL_API_KEY` in the environment that launches the client, then restart it (API-key mode only).
- `401` with `WWW-Authenticate`: complete OAuth, or check that the header is named `x-api-key`, the key starts with `sk-proj-`, and the key is not revoked.
- `403`: use a key/token bound to the requested workspace and verify permissions.
- `402`: verify Developer-plan access and remaining credits.
- `429`: wait for the RPM window; do not rotate keys to bypass limits.
- Tool mismatch: refresh the plugin and compare against the production server card.

Do not print the key, write it into tracked JSON, or use command-line arguments that may persist in shell history.
