# Payables agent workflows

## A. Full payment run

```text
owner prompt
  → resolve mailbox + load registry + get_paybox_connection
  → search_emails (bounded) → get_email → download_attachment (optional)
  → extract fields → 7 security checks → status per invoice
  → paybox_get_portfolio + paybox_list_credentials
  → PAYMENT RUN TABLE  ── owner approves ──┐
                                           ↓
  → per approved invoice: preview → paybox_request_transfer (once)
  → PayBox signing handoff → STOP TURN
  → owner: "signed" → paybox_get_request (once each)
  → save_draft remittance → owner approves → reply_to_email
  → move_email to Payables Paid / Payables Held → owner summary
```

### Payment run table (shape)

| Invoice | Vendor | Amount | Due | Pays to (registry) | Status | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| INV-1001 | Northwind Logistics | 0.10 USDC | 2026-10-20 | base 0x1111…1111 | ready_to_pay | — |
| INV-1001 | Northwind Logistics | 0.10 USDC | 2026-10-20 | — | held_duplicate | Same number as an invoice already in this run |
| INV-1002 | Northwind Logistics | 0.25 USDC | 2026-10-22 | — | held_payout_change | Email asks to pay a new wallet address |

Below the table: total ready, total held, wallet balance, and "Reply **approve all**, **approve INV-…**, or **stop**."

### Turn boundaries

- Turn 1 ends at the payment run. No wallet writes.
- Turn 2 (after approval) ends at the PayBox signing handoff. Do not poll.
- Turn 3 (after "signed" / "status") reconciles, drafts remittances, and ends at the remittance approval.
- Turn 4 sends remittances, files emails, and gives the summary.

If the owner says "approve and send remittances when paid" in one message, turns 3 and 4 may merge, but remittances still wait for terminal success.

## B. Audit only

Same as A, stopping after the payment run table. Useful on API-key sessions (no wallet tools) and for a first look at a messy inbox. Report `wallet: not checked` instead of a balance.

## C. Owner updates the registry mid-run

1. Owner states the change in chat.
2. Agent repeats it exactly: vendor, field, old value, new value.
3. On "yes", re-run checks for that vendor's invoices only and show the updated rows.
4. An invoice previously `held_payout_change` stays held if its email still names a destination different from the new registry value.

## D. Insufficient balance

If ready total > balance, show the shortfall and offer: pay a subset the owner picks, or fund the wallet through the Agent Wallet funding handoff (`get_agent_wallet` → `funding_handoff.console_url`, owner only). Funding never approves a payment; re-read the portfolio after the owner says funding is done.

## E. Failure states

| Situation | Action |
| --- | --- |
| `get_paybox_connection` not `ACTIVE` | Give the returned handoff once; continue as audit |
| Transfer schema error before PayBox | Fix the named field once in the same turn |
| Timeout / unknown transfer result | `paybox_get_request` once; else `uncertain`, no remittance, no retry |
| `paybox_tool_error` (502) | Report it; a new transfer needs fresh owner approval |
| `reply_to_email` fails | Keep invoice `paid`, not `remitted`; report the error code |
| Folder move fails | Report; the duplicate check also covers this run's in-memory list |
