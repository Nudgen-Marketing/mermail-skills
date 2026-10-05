# Workflows

`dca` is `node <skill directory>/scripts/dca.mjs`; append `--home <desk home>` to every command and keep the same home for the life of a mandate. Stop on any engine refusal and report it; never work around the engine.

## 1. Create a standing order

1. `list_mailboxes` → choose the desk mailbox (`public_id`, `email`). Its triage should be draft or review so it never auto-replies.
2. `get_paybox_connection` once → `paybox_list_credentials` → the Solana wallet credential (`credential_id`, `metadata.address`). Note `approval_mode`: `autonomous` with `autonomous_signing.state: ready` runs unattended; otherwise every slice ends in a signing handoff.
3. For each asset the user names, query the catalog by name, then `/api/v1/products/{id}/verification?network=Solana`. Accept only `status: verified`, `identity.verified: true`, a matched Solana address, `isTradingHalted: false`. Pin `productId` and `mint`. If several products match, ask once.
   - Never resolve a mint from a ticker search. `paybox_discover_tokens` for "SPYx" returns three tokens named "SP500 xStock": one with real liquidity and two look-alikes, one with no liquidity and one with a single holder.
4. Fill the mandate from [templates.md](templates.md): owner email from the user, mailbox and wallet from steps 1–2, slices, cadence, caps, slippage guard at or below the wallet's `max_slippage_bps`, validity.
5. `dca check --mandate -`. Show the preview line, `#shortId`, wallet address and mailbox, and ask for one approval.
6. After approval: `dca init --mandate -` → `dca outbox --id <shortId>` → `send_email` with the returned payload → `dca mark-mailed --id <shortId> --through <throughSeq>`. The owner now holds the mandate ticket.

## 2. Run one tick

1. Controls:
   - `search_emails` `{ subject: "#<shortId>", folder: "inbox", date_start: <previous tick>, require_scan_status: "clean", limit: 25 }`.
   - `get_email` each id with `{ require_scan_status: "clean", max_body_chars: 10000 }`.
   - Pipe the array of messages to `dca controls --id <shortId> --input -`. The engine applies an owner PAUSE or STOP and records escalation attempts.
2. `paybox_get_portfolio { address: <wallet> }` → pipe the JSON unchanged to `dca plan --id <shortId> --portfolio - --commit`.
3. Read the plan:
   - `halt`, or an `integrity_failed` error: stop, report, do not buy.
   - `reconcile`: go to section 3 before anything else.
   - `buy`: go to step 4.
   - `refill`: go to section 4.
   - `status` `paused`, `revoked`, `expired`, `exhausted`, `not_started` or `waiting`: no buys; continue at step 6.
4. For each `buy`, in order:
   1. `dca record --id <shortId> --kind intent --slot <slot> --leg <leg>`.
   2. One `paybox_request_swap` with the fields in [tools.md](tools.md).
   3. `dca record --id <shortId> --kind submitted --slot <slot> --leg <leg> --request-id <request_id>`.
   4. `status: success` with `output.value.tx_hash` → `dca record --id <shortId> --kind filled --slot <slot> --leg <leg> --tx <tx_hash>`.
   5. `pending_signature` or `pending_approval` → show the one returned handoff URL to the owner and stop buying in this tick.
   6. Error → `dca record --id <shortId> --kind failed --slot <slot> --leg <leg> --reason "<error code>"`.
5. If `statementDue`: section 5.
6. `dca outbox --id <shortId>` → if not empty, `send_email` with `mailboxId`, `body { to, from, subject, html }` and `idempotencyKey` exactly as returned → after a successful send, `dca mark-mailed --id <shortId> --through <throughSeq>`. If the send fails, leave it; the next tick's outbox includes the same records again.
7. Reply with one line: what was bought (Solscan links), refused or reconciled, and the budget left.

## 3. Reconcile a submitted slice

`paybox_get_request { request_id }`, once per tick:

- Terminal success with `tx_hash` → `record --kind filled --tx <tx_hash>`. If the engine answers `fill_unproven: tx_not_found`, the RPC has not indexed it yet; leave the slice and retry next tick.
- `denied` or `error` → `record --kind failed --reason "<status>"`.
- Still pending → stop the tick.

Never create a replacement swap. A slice whose intent was recorded without a request id becomes `uncertain` automatically: it stays counted against the budget and the owner gets an alert to check the wallet.

## 4. Refill Solana USDC

1. `paybox_get_portfolio` for the Base wallet. If its native USDC covers the action's `shortfallRaw`, `list_bridge_routes`, then one `prepare_bridge` (Base → Solana, recipient = the mandate wallet, decimal amount, stable `idempotencyKey`).
2. Tell the owner the quote needs their approval in the Mermail Agent Wallet UI. Chat, email and an autonomous grant do not approve a bridge.
3. Later ticks: `get_bridge_status` with the `quoteId`; only confirmed destination delivery counts. Never call `prepare_bridge` again to poll.

## 5. Statement

`paybox_get_portfolio { address: <wallet> }` → `dca statement --id <shortId> --portfolio -` → section 2 step 6 to mail it. Each holding is prorated to what this desk bought (other holdings of the same asset are not counted) and multiplied by the catalog's scaled UI multiplier.

## 6. Pause, resume, revoke, replace

- Pause or stop: the owner replies PAUSE or STOP to any desk email, or asks in the session (`dca revoke --user-request "<words>"`).
- Resume: only when the user asks in the authenticated session: `dca resume --id <shortId> --user-request "<their words>"`.
- Replace: caps, cadence, assets and owner are part of the mandate hash. Build a new mandate, preview and approve it, `init` it, then `revoke` the old one.

## 7. Audit

- `dca status --id <shortId>` for budget, integrity and recent records.
- `list_emails { folder: "sent" }` + `get_email` for the desk's mail with `#<shortId>`, piped to `dca verify --id <shortId> --against -`. A `diverged` result means the local ledger no longer matches what was mailed: stop and report.

## 8. Rebuild a lost desk

1. `list_emails { folder: "sent" }`, keep messages whose subject has `#<shortId>`, `get_email` each without a character cap.
2. `dca rebuild --input -` with the messages. The mandate ticket's first record carries the mandate itself; the engine re-hashes it, keeps only Sent mail from the desk address, and refuses conflicting records, gaps and broken hashes. Nothing is written yet: it returns `confirmation_required` with the mandate preview.
3. Show the preview and `#<shortId>` to the user. Only if they confirm it is their standing order, run `dca rebuild --input - --confirm <shortId>`.
4. Run `dca status` and continue ticking with the same `--home`.
