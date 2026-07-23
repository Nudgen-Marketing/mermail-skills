# Platform configuration

**Preferred:** OAuth against `https://console.mermail.app/mcp` in Cursor, Claude, and ChatGPT connectors — no API key in config.

**API-key mode** (Codex, OpenClaw, headless): set the secret before launching the client:

```bash
export MERMAIL_API_KEY="sk-proj-your-key"
```

## Codex

**GitHub plugin path** uses API-key headers (`MERMAIL_API_KEY`):

```json
{
  "type": "http",
  "url": "https://console.mermail.app/mcp",
  "env_http_headers": {
    "x-api-key": "MERMAIL_API_KEY"
  }
}
```

Use `/mcp` to inspect the connection. Restart Codex after changing the environment.

**Official Plugins Directory** (Linear-style Apps Connected) uses **OAuth** after OpenAI approves the Mermail plugin — see [CODEX_MARKETPLACE.md](../../../CODEX_MARKETPLACE.md). Do not put an API key in Directory App config.

## Claude / Claude Code

Prefer the Claude connectors UI (OAuth). For Claude Code with an API key:

```json
{
  "type": "http",
  "url": "https://console.mermail.app/mcp",
  "headers": {
    "x-api-key": "${MERMAIL_API_KEY}"
  }
}
```

Use `/mcp` or `claude mcp get mermail` to inspect the connection. Run `/reload-plugins` after plugin updates.

## Cursor

Prefer OAuth: add `https://console.mermail.app/mcp` (or the Cursor deeplink from [mermail.app/agents](https://mermail.app/agents)), then Authenticate — no `x-api-key` header needed.

API-key fallback if OAuth is unavailable:

```json
{
  "type": "http",
  "url": "https://console.mermail.app/mcp",
  "headers": {
    "x-api-key": "${env:MERMAIL_API_KEY}"
  }
}
```

Open MCP settings to verify the server. If Cursor was launched from the desktop, ensure the desktop process receives `MERMAIL_API_KEY`; exporting it only in a shell does not update an already-running app.

## Security

- Store keys in environment or the platform secret store.
- Use the narrowest workspace-scoped key.
- Revoke exposed keys immediately.
- Never commit expanded configuration containing a real `sk-proj-` value.
