# Evidence ledger and calculations

Preserves useful reporting contributions from PRs [473](https://github.com/Nudgen-Marketing/mermail-skills/pull/473), [449](https://github.com/Nudgen-Marketing/mermail-skills/pull/449) and [155](https://github.com/Nudgen-Marketing/mermail-skills/pull/155): annualized rankings, duplicate-review/readback, and lifecycle/month-over-month reporting. These are evidence rules, not payment verification.

## Identity, evidence and lifecycle

Key a row by workspace + mailbox + vendor identity + masked account/subscription identity + plan + currency + billing basis. Vendor name or domain alone must not merge different customers, seats, products or plans. Missing identity makes linkage uncertain: keep separate provisional records or ask rather than collapsing them. Sender authentication pass is an authentication signal, not proof a charge settled or a vendor claim is true.

Retain raw stated fields, normalized values, source email IDs and dates, and status `stated`, `derived`, `missing` or `conflicting` per field. Distinguish message receipt time, charge time, service period, next billing date and cancellation effective date. Prefer explicit dates; ambiguous timezone or date format stays unresolved. Newer conflicting evidence does not silently overwrite old terms.

Deduplicate exact receipt/invoice copies using the same issuer/account/invoice or transaction identifier and service period, preserving all source IDs. Invoice, reminder and receipt for one transaction are not three charges. If identity is absent, label a possible copy rather than discarding it. Distinct transaction IDs for the same account/period/amount can be possible duplicate charges, never proof of double settlement. Keep unresolved duplicates out of definitive totals and show their potential effect separately.

Recurrence basis: `stated` when explicit subscription/cadence terms exist; `observed pattern` for distinct comparable charge periods with corroborating account/plan evidence, not copies or repeat sender alone; both may apply. A single receipt proves neither recurring nor one-off. Lifecycle: `subscribed`, `trial`, `cancellation pending`, `canceled effective <date>`, `one-off` only with supporting evidence, otherwise `unknown`. Missing recent receipts is not cancellation; a request or acknowledgment is not effective cancellation. Do not infer usage or lack of usage from missing mail.

## Amounts and run-rate

Extract the specific billed recurring amount, currency, quantity, discounts/tax and service period. Do not select the largest currency figure, treat an invoice due as paid, default ambiguous `$` to USD, or silently mix refunds/credits with charges. Preserve refund sign and original transaction linkage separately. Missing amount/cadence, conflicting identity, unauthenticated sender or non-comparable billing basis stays visible but excluded from confirmed recurring totals.

Use exact decimal/rational arithmetic, rounding only final displayed totals to the currency's precision. Compute annual run-rate from the latest supported active recurring price for each row, not the sum of all historical receipts. Monthly ×12; annual ×1; weekly ×52; every four weeks ×13 (52-week convention, labeled approximation); every N months ×12/N. Monthly equivalent = annual/12. Other/unknown cadence is excluded until resolved, not assumed monthly. An explicit end date may limit forecast duration; annualized run-rate is not a promise of actual next-year charges. Canceled-effective rows are excluded from current run-rate, while historical charges remain.

Keep separate totals/rankings by currency. Sort annualized cost descending within currency (unknown rows separately). FX conversion only if explicitly requested with identified rate source/date and a separate converted view. Never call mixed-currency sums a total. Label run-rate versus actual evidenced charges for the reporting period, including refunds separately; annual subscriptions paid this month are not twelve monthly payments.

Price increase requires positive difference between like-for-like recurring prices: same account/plan, currency, quantity, service period length, tax/discount basis and non-prorated charge type. Show old/new IDs, absolute delta, and delta/old ×100 only when old >0. Lower price is a decrease; changed seats/tax/promo/period is a changed-charge finding pending reconciliation, not proven price increase. Unknown or zero baseline cannot yield a valid percent increase.

Month-over-month compares snapshots on an explicitly stated as-of date under the same definitions and coverage. Show newly observed versus confirmed new subscriptions separately, evidence-backed cancellations/effective dates, price changes and per-currency run-rate deltas. A missing row in an incomplete prior/current window is not a new/canceled subscription. State exclusions and unmatched records.

## Renewal and trials

Use a stated next-renewal date when available. Otherwise project only an explicit cadence from the relevant billing anchor using calendar months/years, not fixed 30/365-day additions; label estimate and explain month-end convention. Missing anchor/cadence means unknown. A matching account/plan cancellation confirmation can clear an alert only for its effective period; a cancellation in the same thread for another account cannot. Future-effective cancellation may leave a charge before its effective date unresolved. No matching confirmation within a bounded search means `conversion risk not resolved`, not guaranteed conversion or permission to cancel.
