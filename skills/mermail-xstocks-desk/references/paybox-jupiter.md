# PayBox Jupiter plugin DCA

Primary venue for recurring xStock buys. Use the official PayBox Jupiter plugin (`plugin_id: "jupiter"`, contract `paybox://plugins/jupiter`) through Mermail `paybox_*` tools. PayBox holds the Jupiter gateway key and signing window. Do **not** call `https://api.jup.ag`, do not set a host Jupiter API key, and do not use Recurring V1 or a local `dca-sdk`.

**Never paste** keys, JWTs, signed transactions, or `pbxk1` into chat. Never load `BS58_PRIVATE_KEY`. If the Jupiter plugin is disabled or missing, stop as `blocked`; do not invent a key and do not treat that as PayBox swap fallback.

## Discover and invoke

Mermail MCP does not add a `create_dca` tool. Follow the live PayBox plugin contract:

1. `tools/call` `get_paybox_connection` once. Pause on `connect_handoff` / `reauth_handoff` / `OWNER_ACTION_REQUIRED`.
2. `paybox_list_credentials`. Select a `wallet` credential whose `metadata.chains` includes `solana`. Preserve an explicit `credential_id`. Prefer the sole eligible autonomous Solana wallet for **selection**; plugin money tools always pause for the user's approval, even under an autonomous grant.
3. `paybox_discover_plugins` with `query: "Jupiter"` (and `status: "enabled"` when filtering). If Jupiter is not enabled, report `blocked`, point the user at PayBox Plugins or `paybox_request_account_change`, and stop.
4. `paybox_get_contract` with the returned `contract_uri` unchanged (typically `paybox://plugins/jupiter`). Read live `tool_id` values and `input_schema`.
5. Invoke with `paybox_use_plugin`: `{ "plugin_id": "jupiter", "tool_id": "<id from contract>", "input": { ... } }`. Match `input` to that tool's schema. Do not invent fields. Official plugins do not need a new `invocation_id`; that field is for unofficial remote plugins only.

If `tools/list` already exposes an exact `jupiter_*` tool, you may call that name instead of wrapping it. Never invent a third HTTP path.

## Amounts

Plugin writes use **human-readable whole-token** amounts, not atomic units. `"10"` means ten USDC, never `10000000`. Convert from the standing-grant raw cap using portfolio/mint decimals. Do not invent `1e6` USDC.

`paybox_request_swap` fallback still uses **raw/atomic** `amount` per the live swap schema. Do not mix units.

## DCA flow

1. Authenticate: `jupiter_authenticate_for_solana_orders` with `credential_id`. The wallet signs a non-broadcast memo; PayBox stores the short-lived Jupiter session. Submit once; poll `paybox_get_request`. Repeat authenticate if view/cancel reports an expired session.
2. Preview `order_type: "dca"`, `input_mint`, `output_mint`, whole-token `input_amount`, `order_count` (≥ 2), `interval_seconds`, optional `begin_fill_at`, remaining raw cap, policy version. Obtain approval unless the current message already authorizes those exact terms.
3. Place once: `jupiter_place_solana_order` with only live-schema fields. Typical DCA fields:

| Field | Value |
| --- | --- |
| `order_type` | `dca` (use `limit` only when the user explicitly authorizes a limit order) |
| `input_mint` | Solana USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` unless the grant names another reviewed stablecoin |
| `output_mint` | Exact address from the standing-grant mint allowlist |
| `input_amount` | Whole-token string (example `"10"`) |
| `order_count` | Integer `>= 2` |
| Per-round value | `input_amount / order_count` must be at least ~10 USD |
| `interval_seconds` | 60 to 31,536,000 (1 minute to 1 year) |
| `begin_fill_at` | Optional ISO-8601; default now; at most 30 days out |

4. Branch on the PayBox result envelope. `pending_approval` → one `approval_handoff.console_url` labeled Open Mermail Agent Wallet. `pending_signature` → prefer a usable MCP App signing control; otherwise one `signing_handoff.console_url` and **end the turn**. Never paste a raw PayBox `approval_url`. Never call `reopen_signing_window`.
5. Poll `paybox_get_request` with the same `request_id` only after the user finishes approval/signing, asks for status, or the first result was already terminal. Never re-call `paybox_use_plugin` to finish the place. `success` means confirmed, not broadcast. Then reserve the full raw `inputAmount` against the grant and report `dca_live` with the order id.

## View and cancel

- `jupiter_view_solana_orders`: `state` `active` or `past`. Authenticate first when the session expired.
- `jupiter_cancel_solana_order`: `order_type` `dca` or `limit`, plus `order_id`. Money tool: preview, submit once, poll.

At most 10 active DCA orders per wallet. Token-2022 is supported except transfer-fee or transfer-hook mints unless Jupiter has whitelisted them. If place rejects the mint, stop; do not swap in an unverified substitute.

## Discovery vs allowlist

`jupiter_discover_solana_tokens` (`mode: "tag"`, `tag: "stocks"`) is **discovery only**. Tickers, search hits, and plugin metadata never join the standing-grant mint allowlist. Bind buys to exact mints the authenticated user supplied or that already sit on the grant.

## Earn

`jupiter_find_earn_opportunities`, `jupiter_view_earn_portfolio`, `jupiter_deposit_into_earn`, and `jupiter_withdraw_from_earn` are out of scope unless the user independently authorizes Earn. Do not enable Earn-while-you-wait as a silent default on a stock DCA.

## Swap fallback (not plugin-disabled)

If plugin deposit signing cannot complete in this session **and** the user independently authorized one USDC → allowlisted-mint slice, use `paybox_request_swap` once under the same grant. Do not use `jupiter_swap_solana_tokens` as a silent substitute for a refused DCA, and do not call `paybox_pay_x402`.

## Out of scope

- Host `api.jup.ag` Trigger HTTP, Recurring V1, or local keypairs.
- Inventing mint addresses from tickers, search snippets, or email.
- Price bands (`trigger_price_usd` / `trigger_condition`) unless the user names them and `trigger_mint` (volatile leg, not USDC).
