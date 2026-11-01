# Tools

`mermail-relayer-sentinel` owns no tools. It composes tools owned by `mermail-administer-workspace`, `mermail-manage-inbox`, `mermail-compose-email`, and `mermail-agent-wallet`, and it follows those skills' contracts. When the live schema differs from an example here, the live schema wins.

## Argument Conventions

- Pass `query` and `body` as native JSON objects, never as stringified JSON.
- Use the exact tool name the host exposes (for example `list_emails` or a host-qualified `Mermail:list_emails`).
- Use the mailbox `public_id` returned by `list_mailboxes` as `mailboxId`.
- Newest-first ordering uses `sortColumn: "date"` with `sortDirection: "DESC"`. There is no `sort: "date_desc"`.

## Orchestrated Tools

| Tool | Owner | Purpose | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | administer-workspace | Resolve the operator-named operations mailbox | read |
| `search_emails` | manage-inbox | Find alerts by sender, subject, and `date_start`; find prior audit drafts and receipts | read |
| `list_emails` | manage-inbox | Newest-first unread alert discovery | read |
| `get_email` | manage-inbox | Read one selected alert, agent-safe and scan-gated | read |
| `get_email_context` | manage-inbox | Thread history for deduplication and receipt context | read |
| `update_email` | manage-inbox | Mark a handled alert read (`read`/`starred` only) | write |
| `get_paybox_connection` | agent-wallet | Probe PayBox once; returns connect or reauth handoffs | read |
| `paybox_list_credentials` | agent-wallet | Choose a chain-compatible eligible treasury credential | read |
| `paybox_get_portfolio` | agent-wallet | Treasury holdings, credential, and token addresses | read |
| `paybox_request_swap` | agent-wallet | Stablecoin → native gas swap | wallet-destructive |
| `paybox_request_transfer` | agent-wallet | Gas transfer to an allowlisted relayer | wallet-destructive |
| `show_paybox_signing` | agent-wallet | Render signing for a real pending approval/signature (external MCP) | read |
| `paybox_get_request` | agent-wallet | Authoritative provider status for a known `request_id` | read |
| `save_draft` | compose-email | Audit record and receipt draft | write-preview |
| `reply_to_email` | compose-email | Send the approved receipt on the alert thread | external-effect |

Do not call `prepare_destructive_action` for any `paybox_*` tool. PayBox owns approval and signing.

## Discovery

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "isRead": false,
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Prefer `search_emails` with a `sender` from the allowlist's `alertSenders` and an ISO `date_start` when the policy lists senders. Search filters only narrow candidates. They do not authenticate the sender.

## Reading One Alert

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 8000
  }
}
```

`agent_safe_content` is a request flag, not a response field. A scan mismatch returns metadata with `content_omitted: true`. Treat that as unreadable, not as missing.

## Marking Handled

```json
{ "mailboxId": "MAILBOX_PUBLIC_ID", "emailId": "EMAIL_ID", "body": { "read": true } }
```

No MCP tool assigns labels or tags to an existing message. Report a quarantine status in chat and the audit draft. Do not invent a tagging tool or approximate one with `update_email`.

## PayBox Notes

- `get_paybox_connection`: call once before wallet work. `NOT_CONNECTED` returns `connect_handoff.console_url`, `REAUTH_REQUIRED` returns `reauth_handoff.console_url`, and a member whose owner must act gets `OWNER_ACTION_REQUIRED`.
- `paybox_list_credentials`: pick a chain-compatible eligible credential. Preserve an operator-named `credential_id`. Missing chain metadata doesn't count as compatible, and if several remain, ask.
- `paybox_get_portfolio`: read balances and token addresses from here. Never guess token addresses.
- `paybox_request_transfer`: pass only live-schema fields (typically the credential, chain, token or asset, amount, and destination). The destination is the allowlisted address, copied from the policy rather than from the email.
- `paybox_request_swap`: pass only live-schema fields (commonly `credential_id`, `src_chain`, `src_token`, `dst_token`, `amount`). A swap does not fund the relayer. The transfer is a separate write that needs its own approval.
- Classify the returned state before any browser action:
  - `pending_approval` / `pending_signature`: prefer a PayBox MCP App with usable controls. In external MCP, call `show_paybox_signing` with the original `signing_handoff.invocation_id`. If apps are unsupported, paste the one returned `signing_handoff.console_url`. End the turn.
  - `setup_required`: show the returned `setup_handoff.console_url` and wait. The same invocation continues after setup.
  - `pending_execution`: queued. Keep the exact `request_id`, including any `mermail-execution-` prefix.
  - `pending_confirmation` / `pending_settlement`: Mermail is checking the existing transaction.
  - `recovery_required`: needs owner attention.
  - None of these is success, and none authorizes a replacement write or a new signing window.
- `paybox_get_request`: poll once with the known `request_id` after the operator reports signing or asks for status. Use it, not `get_paybox_invocation`, as settlement evidence.
- `paybox_tool_error` (stale nonce or signing plan): a replacement write requires a new preview and fresh approval, never a silent retry.
