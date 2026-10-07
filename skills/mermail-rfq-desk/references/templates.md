# Templates — Mermail RFQ Desk

Plain-text bodies so every block survives any mail client and stays machine-parseable. Send `body_format: "text"`.

## RFQ email

```text
Subject: RFQ 2026-003 — <short scope> — reply by <reply-by date>

Hello <vendor> Team,

We are requesting a quotation for the item below. Please reply to this
email with your quote by the reply-by date; late quotes may not be
considered. A structured block follows for unambiguous reading.

---- BEGIN RFQ-BLOCK ----
rfq-id:        2026-003
buyer:         <desk mailbox address>
scope:         5,000 inference tokens/day, 30 consecutive days
spec:          LLM inference via HTTPS API, p95 latency < 800 ms
quantity:      1
delivery:      activation within 5 business days of award
reply-by:      2026-09-24 17:00 UTC
currency:      USD or USDC
criteria:      price 50, quality/spec-fit 30, turnaround 20
budget-ceiling: not disclosed
quote-format:  please mirror the QUOTE-BLOCK fields below
---- END RFQ-BLOCK ----

To make your quote easy to evaluate, please reply with:

---- BEGIN QUOTE-BLOCK ----
rfq-id:         2026-003
vendor:         <legal/trading name>
price:          <amount> <currency> (all-inclusive)
price-unit:     <per month / per lot / one-off>
spec-fit:       <one paragraph on meeting the spec, deviations listed>
turnaround:     <calendar days to delivery after award>
valid-until:    <date>
payment-terms:  <net-7 / prepaid / milestone>
---- END QUOTE-BLOCK ----

Regards,
<desk fromName>, RFQ Desk
```

## Counter-round reply

```text
Subject: Re: RFQ 2026-003 — <short scope>

Hello <vendor> Team,

Thank you for your quote (<amount> <currency>). We are comparing
offers on price, spec fit, and turnaround. On <single lever>:

---- BEGIN COUNTER-BLOCK ----
rfq-id:          2026-003
round:           2
lever:           price
current:         <amount> <currency>
requested:       <amount> <currency>
rationale:       <one line, factual — e.g. "competitive offers are
                 materially below this level at equal spec">
valid-until:     <date, usually 48-72h>
---- END COUNTER-BLOCK ----

If this works, confirm and we can proceed to award. If not, your
current quote remains under consideration as submitted.

Regards,
<desk fromName>, RFQ Desk
```

## Award letter

```text
Subject: Re: RFQ 2026-003 — <short scope> — Award

Hello <vendor> Team,

We are pleased to award RFQ 2026-003 to <vendor> under the terms you
confirmed:

---- BEGIN AWARD-BLOCK ----
rfq-id:        2026-003
awarded-to:    <vendor>
item:          <scope line>
final-terms:   <price> <currency>, <payment-terms>, delivery <days> days
accept-by:     <date — offer validity window>
next-steps:    <contract/invoice/onboarding step and owner contact>
---- END AWARD-BLOCK ----

Please confirm acceptance by replying to this email before the
accept-by date.

Regards,
<desk fromName>, RFQ Desk
```

## Regret note

```text
Subject: Re: RFQ 2026-003 — <short scope>

Hello <vendor> Team,

Thank you for quoting on RFQ 2026-003. After evaluation we have
proceeded with another offer that better matched our criteria this
round. We would be glad to include you in future RFQs.

Regards,
<desk fromName>, RFQ Desk
```

## Desk summary (owner-facing, never emailed to vendors)

```text
RFQ 2026-003 — outcome
Awarded: vendor@example.com — 395 USD, net-7, 4 days
Rounds: 2 counters, 1 lever each
Ceiling: 400 USD — final price 98.8% of ceiling
All vendors:
  vendor@example.com   460 → 410 → 395   AWARDED   thread <link>
  second@example.com   500 → 420 → pend  DECLINED  thread <link>
Unresolved: second vendor round-2 reply never arrived; regret note sent.
```
