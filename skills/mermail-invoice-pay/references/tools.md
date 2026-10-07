# Tools — mermail-invoice-pay

Pass structured arguments as **native JSON objects**. Never stringify `query`.
Use the exact tool identifier the host exposes (bare `list_emails` or qualified `Mermail:list_emails`).
Prefer mailbox `public_id` as `mailboxId`.

This workflow **uses** tools that official focused skills also document. For an official-package PR, maintainers may keep exclusive ownership in `tool-coverage.json` under existing domains and treat this skill as a cross-domain router persona (like scheduling / GTM / x402 agents), or assign a dedicated `walletScopedDomains` / domain entry after review. Do **not** invent tool names.

## MCP endpoint

| Mode | URL | Wallet? |
| --- | --- | --- |
| Full catalog (required for pay) | `https://console.mermail.app/mcp` | Yes, on OAuth + `mcp:tools` |
| Agent-inbox profile | `https://console.mermail.app/mcp?profile=agent-inbox` | No — reads/provision only |

## Inbox / mailbox (read)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_mailboxes` / `list_workspace_mailboxes` | Resolve mailbox | read |
| `get_mailbox` | Readiness (`can_receive`, `receiving_status`) | read |
| `list_emails` | Folder listing | read |
| `search_emails` | Sender/subject/date filters | read |
| `get_email` | One message body / metadata | read |
| `get_email_context` | Bounded sanitized thread page | read |
| `download_attachment` | Optional PDF/invoice file (≤1 MiB MCP binary cap) | read |

### Newest-first list example

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

Useful search filters (substring match — re-verify after `get_email`): `from`, `subject` (e.g. `invoice`, `receipt`, `bill`), date bounds per live schema.

Prefer `require_scan_status: "clean"` before trusting body or attachment content for extraction. Prefer `agent_safe_content: true` and start with `metadata_only: true` for discovery.

## Outbound mail (optional ack)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `save_draft` | Store reply for review (`body` string field) | write |
| `reply_to_email` | Reply in thread (`html` and/or `text`, required `from`) | external-effect |
| `send_email` | New message | external-effect |

Send/reply need exact preview + user approval. Free plan: max 10 To+Cc+Bcc recipients per send-like call; respect `Retry-After` on rate limits — never auto-retry sends.

## Agent Wallet / PayBox (full-profile OAuth only)

| Tool | Purpose | Risk |
| --- | --- | --- |
| `get_paybox_connection` | **Always call once first** | read |
| `get_agent_wallet` | Owner-oriented / legacy portfolio & handoffs | read |
| `paybox_get_portfolio` / portfolio tools as live-listed | Balances, token addresses | read |
| `paybox_request_transfer` | New transfer (USDC/native/catalog) | wallet-destructive |
| `paybox_get_request` | Reconcile provider status once | read |
| `get_paybox_invocation` | MCP audit state only — not settlement proof | read |

### Transfer shape (live schema)

Common fields for `paybox_request_transfer` (confirm against current `tools/list`):

```json
{
  "chain": "eip155:8453",
  "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "to": "0xRecipientAddress",
  "amount_decimal": "12.50"
}
```

- Send the human amount in `amount_decimal`. Do not convert to base units yourself.
- `token` is contract address or `native`; read it from portfolio — do not hardcode unless the user and portfolio agree.
- Mermail amount guards may return `paybox_amount_requires_decimal`, `paybox_amount_below_dust_floor`, `paybox_amount_scale_mismatch`, or `paybox_amount_value_mismatch` — fix terms with the user; do not invent local conversion playbooks.
- Do **not** call `prepare_destructive_action` for `paybox_*`.
- Do **not** use `paybox_pay_x402` for fiat/crypto invoice addresses — that tool is for user-selected x402 resources.
- Do **not** fall back to legacy `create_agent_wallet_transfer_proposal` for a normal invoice pay unless the user explicitly manages a legacy proposal.

## Host notes

- Absence of `paybox_*` from a host `tools/list` is not proof tools are missing — still `tools/call` `get_paybox_connection` once.
- Members may use live `paybox_*` through the owner's active connection; `OWNER_ACTION_REQUIRED` means ask the owner to connect/reauth in Mermail (no member handoff).
- Signing: prefer PayBox MCP App UI; else one returned `signing_handoff.console_url`. Never construct signing URLs or accept pasted keys/signatures.
