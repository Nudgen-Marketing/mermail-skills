# Tools — mermail-paid-signup

Pass structured arguments as **native JSON objects**. Never stringify `query`. Prefer mailbox `public_id` as `mailboxId`.

## Inbox / verification (API key or OAuth; agent-inbox profile OK)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_workspaces` | Resolve credential-bound workspace | read |
| `list_mailboxes` / `list_workspace_mailboxes` | Discover reusable mailboxes | read |
| `create_mailbox` | Provision service-scoped address (~10 provision credits) | write-preview |
| `get_mailbox` | Readiness (`can_receive`, `receiving_status`) | read |
| `search_emails` / `list_emails` | Bounded candidate discovery | read |
| `get_email` | Inspect one message (prefer `agent_safe_content`, scan gates) | read |
| `get_email_context` | Sanitized thread page **after** unique selection | read |

Agent-inbox profile exposes the fixed 12-tool set documented at https://docs.mermail.app/ai/mcp — including the tools above (no send, no PayBox).

### Baseline search shape

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

## Agent Wallet / PayBox (full-profile OAuth only)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `get_paybox_connection` | **Always call once first** before claiming PayBox unavailable | read |
| `paybox_pay_x402` | Pay user-selected x402 resource within spend cap | wallet-destructive |
| `paybox_request_transfer` | Catalog transfer after exact preview | wallet-destructive |
| `paybox_request_swap` | Token swap after exact preview | wallet-destructive |
| `paybox_get_request` | Reconcile known request (no blind retry) | read |
| `get_paybox_invocation` | MCP invocation / audit state | read |

Notes:

- Absent from `tools/list` ≠ not exposed — still `tools/call` `get_paybox_connection` once.  
- API keys and `?profile=agent-inbox` never include PayBox.  
- Do not invent tool names; re-check live `tools/list` schemas before writes.  
- Before an official PR, claim ownership only for tools not already owned in upstream `tool-coverage.json` (or route via existing owners).
