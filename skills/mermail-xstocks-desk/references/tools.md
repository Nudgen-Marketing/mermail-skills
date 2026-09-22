# xStocks desk tool contracts

This persona composes existing capabilities. It adds no DCA, mint-registry, statement-storage, or brokerage API to Mermail. Jupiter DCA is the official PayBox Jupiter plugin, invoked through Mermail `paybox_*` tools — not a host HTTP client and not a new Mermail catalog tool named `create_dca`.

Pass `query` and `body` as **native JSON objects**. Never stringify them. Use the exact host identifier (`list_mailboxes` or `Mermail:list_mailboxes`). Prefer mailbox `public_id` as `mailboxId`.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace/mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox`; `create_mailbox` only if authorized | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Bounded inbound reads | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Draft and deliver invoices and statements | `save_draft`, `send_email`, `schedule_email_send` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Portfolio, plugin DCA, PayBox fallback | `get_paybox_connection`, `paybox_list_credentials`, `paybox_discover_plugins`, `paybox_get_contract`, `paybox_use_plugin`, `paybox_get_portfolio`, `paybox_request_swap`, `paybox_get_request` | [Wallet tools](../../mermail-agent-wallet/references/tools.md) and [paybox-jupiter.md](paybox-jupiter.md) |

## Mail

- Full-profile Mermail access is needed for drafting/sends. The restricted agent-inbox profile is not an xStocks execution surface.
- Draft and schedule content is the string `body.body`; send content is `body.html` and/or `body.text`, with required `body.from`.
- Attachments use the live send schema. Include a CSV statement only when the user asked for a downloadable statement and the live schema supports it.
- One idempotency key per approved send. Preserve To/Cc/Bcc. Do not invent recipients.
- Per-DCA invoices use `send_email` after confirmed place/fill/swap. Do not invoice pending or unknown fills. Idempotency key `xstocks-invoice-{order_or_request_id}-{fill_or_place}`. Weekly `schedule_email_send` is for the statement only, not a fill webhook.

## PayBox

- Always `tools/call` `get_paybox_connection` once before any “PayBox unavailable / reconnect MCP” message. Absence from `tools/list` is not “not exposed.”
- Primary DCA: `paybox_discover_plugins` → `paybox_get_contract` → `paybox_use_plugin` with `plugin_id: "jupiter"` and live `tool_id` (`jupiter_authenticate_for_solana_orders`, then `jupiter_place_solana_order` with `order_type: "dca"`). Plugin amounts are whole-token strings.
- Use `paybox_request_swap` only as the **fallback** for one USDC → allowlisted mint slice. Read the live schema. Typical fields include `credential_id`, `src_chain`, `src_token`, `dst_token`, `amount` (raw/atomic).
- Do **not** call `prepare_destructive_action` for `paybox_*`.
- Never use `paybox_pay_x402`, `paybox_request_transfer`, or a local USDC proposal for a stock buy.
- Plugin money tools always pause for the user's approval, even under an autonomous grant.
- Reconcile a known plugin place or swap with `paybox_get_request` once. Pending is not success. On `pending_approval`, present one returned `approval_handoff.console_url`. On `pending_signature`, present one returned `signing_handoff.console_url` (or a usable MCP App) and stop. Never call `reopen_signing_window`.

## Jupiter (PayBox plugin)

Call plugin tools as described in [paybox-jupiter.md](paybox-jupiter.md). Do not invent a Mermail MCP tool named `create_dca`. Do not pass Jupiter secrets through Mermail tools. Do not call `https://api.jup.ag`. A disabled plugin is `blocked`, not PayBox swap fallback.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "xstocks-statement-2026-09-17-a1",
  "body": {
    "to": "you@example.com",
    "from": "desk@mermail.app",
    "subject": "xStocks DCA invoice AAPLx",
    "text": "Confirmed activity invoice for this DCA event as authorized. Not a tax invoice."
  }
}
```

```json
{
  "plugin_id": "jupiter",
  "tool_id": "jupiter_place_solana_order",
  "input": {
    "credential_id": "00000000-0000-4000-8000-000000000000",
    "order_type": "dca",
    "input_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "output_mint": "So11111111111111111111111111111111111111112",
    "input_amount": "10",
    "order_count": 2,
    "interval_seconds": 86400
  }
}
```
