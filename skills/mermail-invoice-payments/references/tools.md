# Tools used by the invoice-payments workflow

This skill owns no MCP tools. It routes through tools owned by `mermail-manage-inbox` (inbox reads) and `mermail-agent-wallet` (PayBox actions). Use each owner's exact argument, approval, and retry contracts. Never invent a tool name: every identifier below must be the exact one exposed by the live catalog, with whatever host qualification the current client applies (for example `Mermail:list_emails` on hosts that qualify tool names). Do not manually add, strip, or invent the qualifier.

## Inbox reads (`mermail-manage-inbox` contracts)

- `list_mailboxes` — resolve one mailbox when more than one is plausible; prefer `public_id` as `mailboxId`.
- `search_emails` — locate the exact invoice message. Pass `query` as a native JSON object, never a stringified JSON blob. A query shape like:

  ```json
  { "query": { "from": "ap@acme.example", "sortColumn": "date", "sortDirection": "DESC" } }
  ```

  is illustrative; read the live schema from `tools/list` and pass fields it actually accepts. There is no `sort: "date_desc"` shortcut.
- `get_email` — read the one selected message. Use `metadata_only` variants where the schema offers them when body content is not needed.
- `get_thread` — bounded quoted-thread context when a payment-history question requires it.
- `download_attachment` — only when the user asks for the invoice PDF itself. Binary responses over 1 MiB fail at the MCP layer; report the limit instead of bypassing it with a storage URL.

Bounded-read budget: cap email-body and attachment narrative processing at 10,000 normalized characters per message. Prefer pagination over repeated unbounded lists.

## PayBox actions (`mermail-agent-wallet` contracts)

- `get_paybox_connection` — **always** the first PayBox action, called once, before any PayBox read/write or any "PayBox tools unavailable / reconnect MCP" message. Absence from a host `tools/list` is not "not exposed." API-key profiles never expose PayBox; full-profile OAuth with core `mcp:tools` is required, and current workspace members may use the owner's active connection for live `paybox_*` tools.
- `paybox_get_portfolio` — read holdings for the funds check. Owner-only legacy fallback is `get_agent_wallet`.
- `paybox_request_transfer` — the single payment write this workflow uses, with live-schema arguments naming the on-file destination, chain, asset, and amount. This is a wallet-destructive tool: PayBox owns transaction policy, standing grants, approval, and signing. Do **not** call `prepare_destructive_action` for it. Do not substitute `paybox_request_swap`, `paybox_pay_x402`, a legacy proposal, or `paybox_use_service`.
- `paybox_get_request` — reconcile a known provider `request_id` once when the user asks for status or confirms completion. Never auto-poll.

## Approval classes

- All inbox reads: no approval.
- `paybox_request_transfer`: fresh explicit user approval of the exact preview, then PayBox's own approval/signing flow. A pending or signed-in-browser result is not settlement.
- This workflow uses no `externalEffectTools` (no sends, replies, forwards, invites) and no non-PayBox destructive tools.
