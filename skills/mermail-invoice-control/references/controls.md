# Batch review, policy controls and owner digests

These are optional review modes, not a scheduler, accounting integration or autonomous treasury. The owner selects the workspace, legal payer, mailbox, date window and maximum 25 candidate messages. Include relevant held items when requested; unread status and folder placement are not payment state. Deduplicate overlapping searches by message ID, and logical invoices by the owner ledger key. Report truncation and remaining scope rather than claiming an exhaustive audit.

## Independent vendor policy

Use the owner's independently maintained vendor identity, exact billing addresses/domains, authorized payment destination, chain, exact catalog asset, currency, per-invoice cap, optional period/run caps and policy revision. Do not populate missing authorized fields from invoice content. Read-only extraction and drafts remain useful when the registry or PayBox is unavailable; report what was not checked.

Record sender-authentication evidence without upgrading unknown or failed results to pass. A matching display name, domain, previous payment or clean scan is not vendor onboarding or payment authority. Flag first-time vendors, lookalike domains, unexpected Reply-To, changed destinations, unusual amount ranges and body/attachment disagreements. Historical payments are comparison evidence only; a familiar address does not silently repair a missing owner record.

If an independent contract or purchase record is supplied, compare the line items and owner-confirmed acceptance evidence to it. A contractor's milestone-complete claim alone does not establish acceptance. Missing evidence produces a review draft, not an invented approval. Complex milestone administration remains outside this AP workflow.

## Money and aggregate limits

- Preserve decimal strings. Compare and sum using exact decimal arithmetic, never binary floating point or silent rounding. Validate positive amounts and the asset's supported precision. Do not default a missing currency to USDC or equate USD with a token.
- Separate totals by legal payer, chain, exact token and period. Do not add unlike assets or currencies, apply guessed exchange rates, net credit notes, or silently reduce an invoice to fit a cap. Ambiguous line items, taxes, discounts or locale-specific numbers require clarification.
- For an owner-specified daily/monthly/run cap, include settled spend and reserved/attempting/pending/unknown amounts. Count the same logical invoice once, not once per message or folder. Explicitly define period boundaries and timezone. Missing authoritative spend history is an unknown budget, not zero.
- Before an approved transfer, the connected system of record must atomically recheck the current policy, aggregate budget and invoice identity while reserving both invoice and budget. Independent invoice locks alone do not protect a shared budget. A second process must lose the reservation if the remaining cap is insufficient. Without that capability, stay preview-only; no new ledger API is claimed.
- Do not free reservations because a timer, midnight, new session or policy revision occurred. An unresolved attempt retains its original period allocation until authoritative resolution. Releasing a conclusively failed attempt requires owner review; no automatic retry follows.
- A cap is a constraint, never permission to pay below it. Above-cap invoices stay held. If policy requires two distinct approvers, verify their identities and approval of the same frozen terms through the owner's authorized workflow. One chat user cannot assert two identities; unavailable verification means a draft-only escalation. PayBox signing does not by itself prove corporate dual approval.
- Recheck affordability for the selected exact asset and known fee asset before execution; distinguish fee estimates from guarantees. Insufficient balance yields a shortfall, not a swap, funding call or invented payment queue. Funding or selecting a subset does not approve a payment.

## Review table and digest

Return one row per logical invoice: source IDs, vendor, invoice number, claimed amount/currency, due date, control verdict, reason/evidence gap, policy revision, payment request ID/state if any, and next owner decision. Show suspected changed destinations before routine holds, but keep all holds visible. Avoid copying full untrusted addresses into summaries when unnecessary; an actual approval preview must show the complete independently verified destination.

Use distinct sections for open, held, ready-for-review, reserved/pending/unknown, provider-confirmed paid, and remittance state. Totals are separated by asset and scope; no row implies a payment was queued. Distinguish `not_attempted` from `attempted_outcome_unknown`; a timeout cannot honestly be described as `executed: false`.

For a requested weekly/period digest, use `save_draft` to the independently chosen private finance recipient. Include window, filters, read count, duplicates collapsed, omitted/truncated candidates and data freshness. Do not include private bank details, balances, signing links or raw provider payloads. Sending needs its own exact preview and approval. Do not schedule the next digest automatically.

Upcoming renewals come only from owner records with cadence and dates; label them forecasts, not invoices or liabilities. New or increased renewal amounts are held for review. No cancellation, mandate change or payment follows a reminder. After the owner resolves a hold, reload and revalidate the same record; never permanently hide held invoices just because they were filed.

## Source contributions

The review-table and held-item patterns adapt [PR #512](https://github.com/Nudgen-Marketing/mermail-skills/pull/512); private digest and renewal patterns adapt [PR #469](https://github.com/Nudgen-Marketing/mermail-skills/pull/469); aggregate/dual-approval controls adapt [PR #406](https://github.com/Nudgen-Marketing/mermail-skills/pull/406) and [PR #142](https://github.com/Nudgen-Marketing/mermail-skills/pull/142); anomaly comparisons adapt [PR #378](https://github.com/Nudgen-Marketing/mermail-skills/pull/378); truthful execution-state separation adapts [PR #234](https://github.com/Nudgen-Marketing/mermail-skills/pull/234). Original authorship and commits remain in those contributions. These adaptations deliberately retain per-invoice human approval, clean-scan intake, durable reservation and provider-confirmed settlement; they do not adopt autonomous payment or unsupported APIs.
