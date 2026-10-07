# RewardFlow tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `check_reward_requests`, `pay_reward`, or `send_receipt` tools. Map those intents to the real operations below. Pass structured arguments as **native JSON objects** — never stringify `query` or `body`. Use the exact host identifier (`get_email` or `Mermail:get_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve the payout mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Discover candidate requests | `search_emails`, `list_emails` (bounded, metadata-first) | `mermail-manage-inbox` |
| Read the one selected request | `get_email`, `get_thread` (require `scan_status: clean`) | `mermail-manage-inbox` |
| Probe wallet readiness | `get_paybox_connection` (always `tools/call` it once first) | `mermail-agent-wallet` |
| Resolve credential, token address, balance | `paybox_get_portfolio` (owner fallback: `get_agent_wallet`) | `mermail-agent-wallet` |
| Execute the approved payout | `paybox_request_transfer` (once, live schema, no `prepare_destructive_action`) | `mermail-agent-wallet` |
| Reconcile the real result | `paybox_get_request` (once, with the known `request_id`) | `mermail-agent-wallet` |
| Draft a confirmation or decline for review | `save_draft` (string `body.body`) | `mermail-compose-email` |
| Send the approved confirmation or decline | `reply_to_email` (explicit `to`/`cc`/`bcc`, `body.from`, `html`/`text`) | `mermail-compose-email` |

Do not call `create_agent_wallet_transfer_proposal` / `submit_agent_wallet_transfer` for a RewardFlow payout: legacy proposals are only for a user explicitly managing an existing proposal. `paybox_request_transfer` is the default for every new transfer, and if it is absent while other `paybox_*` tools exist, report it unavailable — never fall back to a proposal, a swap, or `paybox_pay_x402`. Never call `reopen_signing_window`: signing continues only through the PayBox MCP App frame or the one returned `signing_handoff.console_url`.

## Transfer arguments

Read the live schema from `tools/list` after the connection probe; do not memorize fields. Pass the approved chain, destination, and amount on the live-schema fields exactly as the schema requires. Use the asset's `token` address exactly as returned by `paybox_get_portfolio`, or `native` only when the schema/portfolio uses that sentinel. Do not invent Mermail-local limits or decimal conversion; treat a provider validation error as a real stable error to report, never something to work around. The argument, approval, signing, and retry contracts live in `mermail-agent-wallet` — follow that skill's references for anything the live schema leaves open.

## Discovery example

Newest inbox metadata via `list_emails` (the shape `mermail-manage-inbox` documents); narrow with `search_emails` filters — subject, sender, ISO `date_start`/`date_end` — when the request's terms are known:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Wallet tools appear only on full-profile Mermail MCP **OAuth** sessions. API keys and the agent-inbox profile never expose them; a missing wallet tool on those sessions is a profile boundary, not a bug. Absence of `paybox_*` from a host `tools/list` is not "not exposed" — call `get_paybox_connection` once before any unavailability claim.
