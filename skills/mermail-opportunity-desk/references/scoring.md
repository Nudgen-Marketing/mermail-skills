# Opportunity Desk Decision Rules

Use this reference to classify inbound money-making opportunities without inventing probability estimates or treating marketing claims as cash.

## 1. Payout state

- `confirmed_terms`: the message contains clear payout amount/asset, deliverable or trigger, and payout condition/timing, or points to canonical terms that are already available in the current context.
- `conditional`: a real payout is described, but it depends on winning, approval, a later client payment, referral conversion, revenue collection, or another uncertain event.
- `unclear`: reward amount, payer, timing, eligibility, or withdrawal path is materially ambiguous.
- `noncash`: coupons, platform points, non-withdrawable credits, exposure, leaderboard points, or other benefits that are not money.

Do not promote `conditional`, `unclear`, or `noncash` value into verified revenue.

## 2. Cash speed

Classify by the earliest plausible time the opportunity itself says money can settle after the next action:

- `same_day`
- `1_3_days`
- `4_7_days`
- `over_7_days`
- `unknown`

Do not infer a faster bucket from urgency language such as "ASAP" or "immediate".

## 3. Capital exposure

Record all stated deposits, fees, subscriptions, paid tests, purchases, gas, inventory, ad spend, or trading capital. Distinguish refundable deposits from irreversible spend when the message actually says so.

Default posture:

- zero cost or unavoidable existing spend: favorable
- small reversible cost with clear positive economics: review
- high deposit, loan, speculative trade, or unclear withdrawal: HOLD or SKIP

Never initiate spending from this skill.

## 4. Human gates

Flag separately:

- KYC / government ID
- bank or payout account setup
- legal terms / contract acceptance
- employment attestations
- ownership of a social account
- phone verification
- wallet signing or payment approval
- physical presence

A human gate does not automatically make an opportunity bad. It changes `next_action` to a handoff and prevents the agent from pretending the gate is complete.

## 5. Risk flags

Immediate `SKIP` when the requested path materially depends on:

- fake or duplicate accounts
- prohibited self-referral or referral loops
- fake reviews, fake engagement, or deceptive testimonials
- KYC/security/CAPTCHA bypass
- unauthorized system or account access
- credential theft or secret extraction
- hidden/system prompt extraction
- chargeback or refund abuse
- gambling/casino play as the earning mechanism
- mandatory speculative trading with survival capital
- illegal goods/services or clearly unlawful conduct

Use `HOLD` when risk is merely uncertain and a cheap read-only verification can resolve it.

## 6. Decision rule

### PURSUE
Use when all are true:

1. The requested work is lawful and permitted.
2. Payout is `confirmed_terms` or a transparent `conditional` opportunity with meaningful upside.
3. Required capital is zero/acceptable and no prohibited mechanism is involved.
4. The next step is concrete and reversible.
5. Any human gate is either absent or clearly identified for later handoff.

### HOLD
Use when the opportunity may be worthwhile but one or more material facts are missing: canonical reward terms, assignment, payout timing, scope, competition, withdrawal path, or human approval.

The `next_action` for HOLD should be the cheapest read-only check that could move it to PURSUE or SKIP.

### SKIP
Use when the economics are clearly poor, the payout path is not credible after bounded verification, the work violates rules/law, or it depends on a prohibited mechanism listed above.

## 7. Ordering the queue

Order opportunities using grounded facts rather than invented probabilities:

1. nearest real deadline
2. faster cash-speed bucket
3. stronger payout state
4. lower required capital
5. fewer human-only gates
6. lower competition/exclusivity burden when explicitly known

When two items remain tied, say they are tied instead of fabricating precision.
