# Opportunity scoring

Score only candidates that survive the hard filter. Keep facts and estimates separate and show assumptions.

## Hard filter

Reject when any required condition fails:

- no explicit reward, payment, or verifiable prize pool;
- expired or unverifiable deadline;
- incompatible geography, age, organization, event attendance, hardware, or credential requirement;
- entry fee, deposit, token purchase, gambling, account rental, credential sharing, or unrestricted live-system testing;
- deliverable cannot be completed within the owner's verified skills, availability, and permitted tools;
- payment depends only on referrals, sales commission, social farming, or speculative future value unless the owner explicitly selected that model.

## EV score, 0–10

Add the five components:

| Component | Points | Evidence |
| --- | ---: | --- |
| Reward certainty | 0–3 | Explicit amount/asset, funded escrow or official pool, documented payout rules |
| Execution fit | 0–3 | Verified skills/samples, bounded scope, achievable artifact and QA |
| Deadline readiness | 0–2 | Can submit today or within 48 hours; sufficient time for required review |
| Gate friction | 0–1 | No new identity, wallet, terms, hardware, travel, or account blocker |
| Competition/payment confidence | 0–1 | Reasonable competition and credible sponsor/payment history |

Subtract up to 3 points for uncertainty that survives the hard filter: unclear scope, high competition, missing timezone, discretionary assignment, new sponsor, unverified payment rail, or work-before-award risk. Clamp the result to 0–10.

When inputs are defensible, also report:

```text
expected_value_per_hour = reward_amount × probability_of_payment_and_win ÷ estimated_hours
```

Do not convert tokens or currencies without a sourced observation time. Do not hide a pool's pro-rata allocation behind a fixed reward estimate. If probability or hours are weak guesses, keep the component score and label numeric EV `not_reliable`.

## Selection rule

Return at most five verified candidates. Prefer one high-confidence submission completed today over several speculative builds. For ties, choose the smaller artifact, clearer acceptance criteria, stronger payment evidence, lower gate burden, and greater reuse of verified existing work.
