# Non-invoice cash-event appendix

Use this reference when the user asks about payment/refund status without an
invoice, or a reconciliation includes such notices. It preserves the cash-event
classification workflow contributed by fizz-step in PR #361. The invoice
calculator, schema and arithmetic remain unchanged. This appendix is a separate
evidence report, not input accepted by `scripts/reconcile.mjs`.

## Scope and provenance

Use the selected mailbox, period and shared search/body budget from SKILL.md.
Search relevant receipt/payment/refund/status terms only within that scope.
Do not expand searches or persist a local report without the user's requested
scope. All body use requires the native clean scan gate. Omitted/non-clean
content stays a metadata-only exception. Unknown authentication is review-only,
not a qualifying flow subtotal. Passed authentication is not settlement proof.

For each observation retain source email ID, timestamp, exact provider/merchant
identity, account scope when available, stable transaction/event ID when stated,
event date, original amount and currency, direction relative to the selected
account, scan/authentication verdict, short supporting evidence and uncertainty.
Use `unknown` for missing values. Never substitute an email ID or guessed invoice
ID for a missing financial reference. Processor names alone cannot join unrelated
merchants/accounts. Do not expose full account numbers or unrelated private text.

## Status table

| Report status | Required evidence | Monetary treatment |
| --- | --- | --- |
| `reported_settled` | Explicit completed/captured/settled payment claim | Eligible reported flow only, never independently verified cash |
| `reported_refunded` | Explicit completed refund claim, distinct refund event | Separate refund flow, never silently netted against a purchase |
| `pending` | Processing, scheduled, or pending payment/refund | Separate non-settled bucket |
| `failed` | Explicit failed or declined attempt | Separate failed-attempt bucket, not money moved |
| `authorized` | Authorization/hold without capture evidence | Separate hold bucket, not settled cash |
| `mention_only` | Quote, offer, invoice, reward promise or amount without payment evidence | Excluded from monetary subtotals |
| `uncertain` | Missing status, direction or identity, conflicting evidence | Review queue; excluded from subtotals |

A receipt title alone is insufficient. A refund requested is `pending`, not
`reported_refunded`; a credit note is not a cash refund. Preserve provider wording
beside the normalized status. No bank/wallet reads or links are needed or implied.

## Identity, transitions and duplicate handling

- Join only exact provider + merchant/account + stable transaction reference.
  Require an explicit event reference or clear source evidence for the same
  event; order number alone cannot merge partial payments or multiple refunds.
- Identical forwarded copies of one event count once, retaining every source
  email ID. Same amount/date/subject is not a duplicate key.
- Keep an authorization → capture history, but use only the evidenced current
  status in status subtotals. A later timestamp alone cannot settle contradictory
  claims; require an explicit correction or transition bound to the same event.
- Refunds are separate events and can coexist with a capture. Missing refund ID,
  reused IDs with different amounts/currencies, ambiguous account identity or
  unclear transition means review all affected observations, not choose a winner.
- Track source IDs across the invoice report and appendix. Show cross-references
  for overlap; never sum both sections or count an invoice-linked receipt twice.

## Amounts and output

Keep original amount/currency and an explicit incoming/outgoing/unknown direction.
Use exact nonnegative decimal strings for magnitude (same limits as ledger.md),
not floating-point conversions; status never invents a sign. Unknown direction,
ambiguous currency, malformed amount, missing stable financial identity or failed
evidence gate excludes that event from numeric subtotals. Retain it in review.

Show rows: status, event date, merchant/payer, transaction/event reference,
direction, original amount, currency, source IDs, evidence and review reason.
Calculate exact subtotals separately by status **and** currency **and** direction,
only after duplicate/conflict checks. Label settled/refund sums “reported by email,
not independently verified.” Pending, failed and authorized sums are non-settled
exposure/attempt/hold figures, never a combined cash total. Do not convert currencies,
net refunds, infer an account balance, tax treatment or withdrawable funds.

If exact arithmetic cannot be checked, show the rows with `subtotal_not_calculated`
rather than an estimated sum. State coverage, omitted records and duplicate source
IDs. A separately requested delivery routes to compose with fresh exact approval;
the report itself never sends, labels, moves or pays.

## Synthetic reasoning checks (not E2E evidence)

- One USD 10 authorization then explicit capture for the same event: history
  retained, USD 10 reported outgoing settled; no extra USD 10 hold counted.
- Two forwarded USD 10 receipts for one event: one flow, both email IDs retained.
- Two USD 10 partial payments with distinct event IDs under one order: two flows.
- USD 10 capture plus distinct USD 3 completed refund: separate payment/refund
  rows and buckets, not a USD 7 settlement assertion.
- EUR 20 pending, USD 4 failed and USD 100 offer: no settled cash; separate pending
  and failed buckets, offer excluded. No cross-currency sum.
- Unknown authentication, missing transaction ID or contradictory refund amount:
  review-only even when a message claims completion.
