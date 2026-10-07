# Spend auditor workflows

## Extraction schema

Fill one record per message from the body text only. Unknown fields stay `unknown`; never infer a value the message does not state.

| Field | Meaning |
| --- | --- |
| `email_id` | Mermail email `id` that supports the record |
| `vendor` | Name as the message states it; keep the sender domain alongside as `sender_domain` |
| `kind` | `charge`, `refund`, `trial_notice`, `renewal_notice`, `failed_payment`, `other` |
| `amount` | Decimal in the stated currency; negative for `refund` |
| `currency` | ISO code or symbol as stated; do not guess |
| `event_date` | Date the charge or refund happened, or the date a notice takes effect, taken from the body |
| `cadence` | `one_time`, `weekly`, `monthly`, `quarterly`, `annual`, or `unknown` |
| `invoice_ref` | Invoice, order, or receipt number |
| `confidence` | `high` when vendor, amount, currency, and date are explicit; `medium` when one is inferred from context in the same message; `low` when truncated or ambiguous |

Use the body's own dates, not the email's received time. A forwarded or re-sent receipt can arrive long after the charge.

## Classification rules

1. **Spend versus notice.** Only `charge` and `refund` records count toward totals. `trial_notice` and `renewal_notice` are future events: list them under decisions, never under spend.
2. **Same invoice, same charge.** Records with the same vendor and `invoice_ref` merge into one; keep the earliest `event_date` and list every supporting `email_id`.
3. **Possible duplicate charge.** Same vendor, equal amount and currency, `event_date` within three days, different `invoice_ref`. Keep both in totals and flag both. The user decides; the skill does not call it fraud.
4. **Price increase.** For a vendor with `monthly` or `annual` cadence, compare the latest charge with the previous one. Flag at an increase of 5 percent or more and show old amount, new amount, and percent.
5. **Trial ending.** A `trial_notice` whose effective date is within 7 days of the as-of date, with the amount that begins afterward.
6. **Upcoming renewal.** A `renewal_notice` or an inferred next renewal within 14 days of the as-of date. Infer a next renewal only from an explicit cadence and the latest charge; mark it `inferred`.
7. **Unverified invoice.** An invoice or payment demand from a vendor with no prior receipt in the window, a demand for urgent payment, a payment link, or a sender domain that does not match the vendor's earlier receipts. Exclude from totals; list separately.
8. **Refund open.** A refund notice with no matching credit or later refund confirmation. Report as informational; the audit cannot see the card statement.

## Totals

- Report per currency. Charges, refunds, net.
- Monthly-normalized recurring run-rate per currency: monthly amount as is, annual divided by 12, quarterly divided by 3, weekly times 52 divided by 12. Use each vendor's latest non-duplicate charge. Round at the end, to two decimals.
- Also report the forward run-rate "if nothing is cancelled" by adding trial and renewal notices that take effect after the as-of date. Label it a projection.

## Wallet cross-check

Match each wallet outflow to receipts by amount (exact), date window (plus or minus three days), and merchant text.

| Result | Meaning |
| --- | --- |
| `matched` | One receipt and one wallet item agree |
| `wallet_payment_without_receipt` | Wallet spend with no receipt. Highest-priority review item for an agent that spends autonomously |
| `receipt_without_wallet_payment` | Informational. The receipt was probably paid by another method |

Never ask the wallet tools to move value to resolve a mismatch.

## Decision order

Sort "decisions needed" by the soonest deadline, then by amount. Each item: what, when, how much, evidence `email_id`, and the next safe action (keep, cancel before the date, dispute, ignore). Offer drafts only for items the user picks.

## Draft guidance

- Cancellation: state the account email, plan, and effective date from the receipt. Ask the vendor to confirm cancellation in writing. No threats, no invented policy claims.
- Dispute: cite both invoice references, dates, and amounts. Ask for a refund of the duplicate and written confirmation.
- Keep each draft under 150 words. Sign with the mailbox display name the user already uses.
