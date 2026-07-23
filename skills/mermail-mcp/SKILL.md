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

1. Prefer **MCP OAuth** when the client supports it: connect to `https://console.mermail.app/mcp`, complete the browser login (same Enoki account as the Mermail console), and pick a workspace. No API key is required in that mode. ChatGPT/Codex **Plugins Directory** Apps Connected also use OAuth once Mermail is published there.
2. Otherwise create an API key in Mermail workspace settings and copy it once (required for Codex GitHub plugin install and OpenClaw).
3. Store the key as `MERMAIL_API_KEY` in the platform's secret environment. Never ask the user to paste it into chat.
4. Configure `https://console.mermail.app/mcp` and map the environment variable to the `x-api-key` header using the platform-specific syntax (skip if using OAuth).
5. Restart or reload the client so its desktop process receives the environment variable.
6. Run `node scripts/check-connection.mjs` from this skill directory, or inspect the server with the client's MCP status command.
7. Confirm that initialization succeeds. The default full catalog must contain the current 63-tool baseline and may add tools in future releases; the opt-in `agent-inbox` profile must contain its exact 11-tool least-privilege set.

For mailbox-scoped tools, pass `mailboxId` as `public_id` (UUID) from `list_mailboxes` when possible; hosted alias id and current email also work.

## Troubleshoot

- Missing environment variable: set `MERMAIL_API_KEY` in the environment that launches the client, then restart it (API-key mode only).
- `401` with `WWW-Authenticate`: complete OAuth, or check that the header is named `x-api-key`, the key starts with `sk-proj-`, and the key is not revoked.
- OAuth loop / cleared credentials in Cursor: remove the Mermail MCP entry, re-add `https://console.mermail.app/mcp`, and complete Authenticate again (logout of Mermail in the browser session first if consent fails).
- `403`: use a key/token bound to the requested workspace and verify permissions.
- `402`: verify Developer-plan access and remaining credits.
- `429`: wait for the RPM window; do not rotate keys to bypass limits.
- Write tools (`send_email`, drafts, etc.) return `code: "validation_failed"` with a `details` array — fix the named fields. Send/reply/forward need `body.html` and/or `body.text` plus `body.from`; drafts/schedule use string `body.body`. See the compose-email skill.
- Tool mismatch: refresh the plugin and compare against the production server card.
- Claude web shows **Finding tools** or `Tool 'Mermail:<name>' not found`: treat this as a stale or unloaded Claude connector registry, not as an instruction to invent another tool name or argument shape. Confirm the production server card still lists the bare protocol name, then disable/re-enable or disconnect/reconnect the Mermail connector and complete OAuth again if prompted. Start a new chat after reconnecting, verify a read-only mailbox-list call, and only then retry the original operation. In Claude, invoke the exact host-qualified identifier it exposes (commonly `Mermail:list_mailboxes` or `Mermail:list_emails`); other hosts may expose their own namespace or a bare name. The underlying Mermail `tools/list` names remain `list_mailboxes` and `list_emails`.
- If tool discovery succeeds but an argument is rejected, inspect the live schema. In particular, pass `query` as a native JSON object; never send an escaped JSON string such as `"{\"folder\":\"inbox\"}"`.

Do not print the key, write it into tracked JSON, or use command-line arguments that may persist in shell history.
