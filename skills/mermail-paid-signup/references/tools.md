# Tools — mermail-paid-signup

This skill **does not own** MCP tools. Tool ownership stays with `mermail-administer-workspace` / `mermail-agent-inbox` (mailbox), `mermail-manage-inbox` (email reads), and `mermail-agent-wallet` (PayBox). Pass structured arguments as **native JSON objects**. Never stringify `query`. Prefer mailbox `public_id` as `mailboxId`.

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

Agent-inbox profile exposes the fixed 12-tool set at https://docs.mermail.app/ai/agent-email-inbox — including the discovery/read tools above (no send, no PayBox).

### Baseline / poll search shape

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

Add `date_start`, `from` / `to`, `subject`, and `require_scan_status: "clean"` when the live schema exposes them. Always re-validate candidates client-side.

## Agent Wallet / PayBox (full-profile OAuth only)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `get_paybox_connection` | **Always call once first** before claiming PayBox unavailable | read |
| `paybox_get_portfolio` / `paybox_get_buy_link` | Holdings / funding handoff (funding ≠ spend authority) | read / handoff |
| `paybox_pay_x402` | Pay user-selected x402 resource within spend cap | wallet-destructive |
| `paybox_request_transfer` | Catalog transfer after exact preview | wallet-destructive |
| `paybox_request_swap` | Token swap after exact preview | wallet-destructive |
| `paybox_get_request` | Reconcile known request (no blind retry) | read |
| `get_paybox_invocation` | MCP invocation / audit state (not settlement proof) | read |

Notes:

- Absent from `tools/list` ≠ not exposed — still `tools/call` `get_paybox_connection` once.
- API keys and `?profile=agent-inbox` never include PayBox.
- Do **not** call `prepare_destructive_action` for `paybox_*`.
- Do not invent tool names; re-check live `tools/list` schemas before writes.
- Keep PayBox retry/signing rules identical to `mermail-agent-wallet` (one write, one reconcile, one `signing_handoff.console_url`, never `reopen_signing_window` from the model).

## Host tools (non-Mermail)

Browser, form-fill, CAPTCHA, and password entry stay on host-allowlisted tools. Mermail MCP never substitutes for those capabilities.
