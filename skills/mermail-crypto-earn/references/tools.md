# Tools used by mermail-crypto-earn

This skill does not own MCP tools. Use the owning skill's contracts and the exact host-qualified tool names from `tools/list`.

## Identity and verification (`mermail-agent-inbox`)

Typical tools:

- `list_workspaces` / `get_workspace` / `get_api_credit_usage`
- `list_mailboxes` / `list_workspace_mailboxes` / `create_mailbox` / `get_mailbox`
- `list_emails` / `search_emails` / `get_email` / `get_email_context`

Prefer MCP URL `https://console.mermail.app/mcp?profile=agent-inbox` for verification-only work.

Pass `query` as a **native JSON object**, never a stringified blob. Newest-first listing uses `sortColumn: "date"` and `sortDirection: "DESC"`.

For verification mailboxes, create with:

```json
{
  "settings": {
    "agentInbox": {
      "mode": "verification",
      "automationsEnabled": false
    }
  }
}
```

## Historical payout search (`mermail-manage-inbox`)

After the active signup flow ends, ordinary search, labels, and cleanup belong to `mermail-manage-inbox` (`search_emails`, `list_emails`, `get_email`, folder/label tools). Keep `require_scan_status: clean` before exposing bodies.

## Optional notices (`mermail-compose-email`)

Only draft or send when the user explicitly asks for a status email. Preview To/subject/body; never auto-send claim materials to third parties.

## Payments

- Isolated wallet inspect / fund / transfer / swap → `$mermail-agent-wallet` (full-profile OAuth).
- Pay one user-selected x402 resource then continue the job → `$mermail-x402-agent`.

API keys and the agent-inbox profile never unlock PayBox tools.
