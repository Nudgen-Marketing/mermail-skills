# Platform configuration

Set the secret before launching the client:

```bash
export MERMAIL_API_KEY="sk-proj-your-key"
```

## Codex

Codex plugin configuration uses an environment-backed HTTP header:

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

## Claude Code

Claude expands `${MERMAIL_API_KEY}` in HTTP headers:

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

Cursor uses environment interpolation in its MCP configuration:

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
