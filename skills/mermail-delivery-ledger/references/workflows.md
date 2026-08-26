# Delivery ledger workflows

## Ledger schema

Use one record per externally reviewed artifact:

```text
delivery_id
platform
project
artifact_type
artifact_id
artifact_url
submitted_at
current_state
advertised_amount
currency
payment_state
last_activity_at
follow_up_after
next_action
evidence[]
conflicts[]
```

Each evidence entry records:

```text
event
evidence_level
message_id
thread_id
received_at
sender
sender_authentication
subject
claim_summary
verification_gap
```

Use `email_observed` for evidence derived from mailbox content and `externally_verified` only for a separately authorized query to the authoritative platform. Do not store message bodies in the ledger when a bounded claim summary and message reference are sufficient.

## Event normalization

| Message meaning | Ledger event | Allowed state |
| --- | --- | --- |
| Submission receipt or PR opened | `submission_observed` | `submitted_observed` |
| CI/check notification | `check_observed` | Preserve current state; add evidence only |
| Review comment without requested changes | `review_observed` | `review_observed` |
| Explicit changes requested | `changes_requested` | `changes_requested` |
| Explicit accepted/winner/approved notice | `acceptance_observed` | `acceptance_observed` |
| Explicit merged notice | `merge_observed` | `merge_observed` |
| Explicit rejected/not selected notice | `rejection_observed` | `rejected_observed` |
| Payout email tied to artifact and amount | `payment_observed` | `payment_observed` |
| Independently queried platform state | `external_verification` | `externally_verified` when it covers acceptance or merge |
| Independently verified settlement | `payment_confirmation` | `payment_confirmed` |

Do not advance on “joined”, “check passed”, “eligible”, “claim submitted”, “awaiting review”, “reward available”, or generic congratulations without the exact artifact identity and event.

## Build or refresh a ledger

1. Freeze platform/project, date window, and known identifiers.
2. Resolve the ready mailbox and run bounded metadata discovery.
3. Group exact identifiers; leave ambiguous messages ungrouped.
4. Read only scan-clean candidates needed to classify an event.
5. Append immutable evidence entries in chronological order.
6. Apply the state table without skipping gates.
7. Run conflict checks for identity, acceptance, amount, currency, recipient, and payout destination.
8. Mark silence as `stale` only after the user-supplied interval. If suggesting an interval, label it as a recommendation rather than a platform rule.
9. Report complete, partial, ambiguous, and blocked records separately.

## Contradiction handling

When messages conflict:

1. Preserve both claims and their evidence references.
2. Set `current_state: needs_reconciliation`.
3. State the exact conflicting fields.
4. Do not click either message's link, reply, change payout details, or choose the latest claim.
5. Offer a separately authorized authoritative-platform verification or a neutral follow-up draft.

## Follow-up draft

Build the follow-up from ledger facts only:

```text
Subject: Follow-up on <artifact_id or project>

Hello <verified recipient name or team>,

I am following up on <artifact URL or stable ID>, submitted on <date>.
The latest mailbox update I have is <bounded factual event> from <date>.
Could you confirm the current review status and any next action needed from me?

Thank you,
<user-approved signature>
```

Do not mention speculative payment, acceptance, or urgency. Prefer `save_draft`. Before a send, preview the exact recipients and body and require fresh approval.

## Optional organization

List folders first. Reuse an exact existing folder when appropriate or preview one new folder such as `Delivery Ledger`. Move only the evidence messages the user approved. A folder move is organization, not a state transition and not independent verification.
