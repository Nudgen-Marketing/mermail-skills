# Opportunity scoring

Score only candidates that survive qualification. Keep facts and estimates separate and show assumptions. Apply [qualification-record.md](qualification-record.md) before ranking; a no-score PURSUE/HOLD/SKIP queue is a complete result when requested.

## Hard filter

Reject when any required condition fails:

- no explicit reward, payment, or verifiable prize pool;
- expired or unverifiable deadline;
- incompatible geography, age, organization, event attendance, hardware, or credential requirement;
- gambling, account rental, credential sharing, deceptive referral loops, mandatory speculative token trading, or unrestricted live-system testing;
- deliverable cannot be completed within the owner's verified skills, availability, and permitted tools;
- payment depends only on referrals, sales commission, social farming, or speculative future value unless the owner explicitly selected that model.

Missing evidence is a `HOLD` rather than a claimed confirmed failure. Disclosed legitimate deposits, subscriptions or other business costs need a separate capital/terms review, defaulting to zero new spend. A cost outside the owner's confirmed budget remains HOLD; it never authorizes payment. Noncash benefits and owner-selected referral/partnership models stay explicitly classified and outside cash EV. Do not call a deposit safe merely because its listing says refundable.

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

Return at most five evidence-qualified candidates. Preserve the requested ordering: for a fastest-cash queue use grounded settlement timing separately from deadline urgency; for EV use this rubric and disclose uncertain inputs. No-score queues use decision, deadline, evidenced cash timing, payout terms, capital and gate burden. Explain ties rather than inventing precision. Prefer manageable scope, clearer acceptance criteria and reuse of verified existing work within the owner's actual goal.
