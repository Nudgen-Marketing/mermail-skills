# Bounty Ops workflows

## Decision card

For each selected opportunity produce:

- `title`
- `source`
- `payout_type`: fixed, range, prize_pool, unknown
- `payout_amount` and `currency`
- `deadline` with timezone
- `work_type`
- `required_deliverables`
- `eligibility`
- `capital_requirement`
- `location_requirement`
- `identity_requirement`
- `fit`
- `verification`
- `verdict`
- `next_action`

Never convert a total prize pool into expected personal income.

## Verdict order

Apply the first matching hard blocker:

1. `expired`
2. `blocked_capital`
3. `blocked_location`
4. `blocked_identity`
5. `not_a_fit`
6. `needs_verification`
7. `candidate`

## Ranking

Rank only `candidate` and `needs_verification` items. Favor:

1. nearer valid deadlines;
2. higher verified payout;
3. stronger technical fit;
4. lower required effort;
5. stronger original-source confidence.

A large unverified prize should not outrank a smaller verified contract merely because the headline number is larger.

## State transitions

`scanning -> candidate|needs_verification|blocked`

Later owner-controlled actions may move to `drafted`, `submitted_by_owner`, or `awarded`.

Only authoritative payout/balance evidence may move an item to `paid_verified`.
