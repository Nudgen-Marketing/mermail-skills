# Standing grant, per-DCA invoice, and weekly statement templates

These are blank structures for owner-authorized runtime use, not records to fill in this repository. They are workflow checkpoints, not an API schema or database. Do not save filled templates, keys, or raw provider payloads into this skill package.

## Private standing-grant record

| Group | Record |
| --- | --- |
| Identity | Owner; workspace ID; mailbox `public_id` and address; policy version; verification time |
| Policy | Spend asset (USDC mint); total cap in smallest units; cadence; exact output mint allowlist; per-slice amount; Jupiter `order_count` / `interval_seconds` when using PayBox Jupiter plugin DCA |
| Invoices | Per-DCA invoices on/off; invoice from mailbox email + `public_id`; invoice to; last invoiced order/fill/`request_id` set |
| Execution | Preferred venue (`paybox_jupiter_dca` or `paybox_swap_fallback`); Solana `credential_id`; active Jupiter order ids; last PayBox `request_id`; remaining cap; reserved pending; confirmed spend |
| Denials | Policy version; request/order id; mint presented vs allowlist; reason |

Do not put private keys, JWTs, signed transactions, API keys, or raw provider responses in this record.

## Per-DCA invoice email

Customer-facing. One email per confirmed place, round fill, or swap slice. No wallet secrets, no raw PayBox/Jupiter payloads.

- Title such as `xStocks DCA invoice` plus ticker and short order/fill id.
- Invoice version, UTC time, policy version.
- Venue (`paybox_jupiter_dca` place, DCA round fill, or `paybox_swap_fallback`).
- Pair: input mint (USDC) and output ticker **and** mint.
- Amounts: whole-token plugin amount and raw units when known; remaining cap after this event.
- Identifiers: order id, fill or tx id, PayBox `request_id`.
- Mailbox from and invoice to as authorized.

Disclaimer: activity invoice for records, not a tax invoice, VAT invoice, or regulated brokerage confirmation.

## Weekly brokerage email

Customer-facing. No wallet secrets, no raw PayBox/Jupiter payloads.

- Title, statement version, reporting window (UTC), data-as-of time.
- Holdings: ticker, mint, raw amount, UI amount, mark if quoted, value.
- Activity: date, venue (PayBox Jupiter DCA round or PayBox swap), input/output mints, raw and UI amounts, tx signature or order id, policy version.
- Spending: cap, confirmed spend, reserved pending, remaining.
- Open DCA orders: id, status, remaining rounds if known.
- Downloadable CSV when requested and supported.

Disclaimer: activity history for records, not a complete tax statement and not a regulated brokerage confirmation.

## CSV columns

`date,type,venue,input_mint,output_mint,input_amount_raw,output_amount_raw,ui_amount,tx_or_order_id,policy_version,request_id`

## Private end-of-run checkpoint

Return mailbox `public_id`, policy version, venue, order/request ids, reserved vs confirmed spend, remaining cap, invoice/statement draft/message ids, and the next action. Do not claim persistence unless an owner-authorized destination confirmed the write.
