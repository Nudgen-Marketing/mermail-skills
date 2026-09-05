# Competitive-round state contract

The packaged runtime persists the authority needed to reconstruct a round: frozen Buyer policy, exact source/evidence references, lane trust results, decision inputs/results, approval bindings, effect reservations/results, and read-only reconciliation observations. Reconciliation observations are normalized through an explicit DirectMermailAdapter read boundary and carry mailbox-local IDs, provider identity when exposed, content digest, read operation, queried mailbox, and observation provenance. Presentation JSON is never authority. Fresh verification uses durable artifacts and code; it does not need a Mermail session or model replay.

This is a conceptual session/state artifact, not a database schema. Persist only as much as the current task needs, but do not omit fields needed to reconstruct authority, isolation, or chronology.

## Three information planes

### Common competition state

Required common fields are `sourcing_id`, immutable `brief_version`, frozen requirements, required commercial fields, selected supplier set, evaluation/comparability policy, disclosure policy, initial closure rule and deadline, current round ID, and the round sequence. The supplier set contains stable supplier IDs, expected mailbox/address identities, and eligibility; supplier mail cannot add, remove, or reorder participants.

### Supplier-local state

Each lane has a supplier ID, expected buyer and supplier identities, buyer/supplier mailbox IDs, thread binding when known, latest validated source binding, actual message evidence, offer revisions, missing fields, clarification status, participation/disposition, and any conflict or lateness marker. A lane never stores another supplier's terms.

### Buyer-private comparative state

This plane may contain normalized current offers, comparability, score or tradeoff calculations, ranking, exclusions, and recommendation material. It is not copied to a supplier lane unless the Buyer gives exact, current authorization naming the recipient and fields. It is never required to make a message look complete: unknown remains unknown.

## Round record

```text
round_id
round_type: INITIAL | BAFO
round_status: OPEN | WAITING | READY_TO_CLOSE | CLOSED | BLOCKED
requirement_snapshot
required_fields
eligible_supplier_ids
common_deadline
closure_rule
disclosure_policy
lane_ids
round_effect_records
opened_at / closed_at
```

`round_type` has no clarification value. A clarification is a supplier-lane action inside `INITIAL` or `BAFO`. A BAFO always has a new round ID and a new immutable snapshot, even when its requirement snapshot is substantively the same as the prior round.

## Round status and transitions

| Status | Meaning | Valid next state |
| --- | --- | --- |
| `OPEN` | Frozen setup, previews, approvals, or lane sends are still being resolved; no unrecorded effect may be assumed. | `WAITING`, `BLOCKED` |
| `WAITING` | Round-level setup is known and the workflow is waiting for delivery, responses, or lane-local actions. | `READY_TO_CLOSE`, `BLOCKED` |
| `READY_TO_CLOSE` | The frozen closure predicate is satisfied and every lane can receive an explicit disposition. | `CLOSED`, `BLOCKED` |
| `CLOSED` | Closure was applied under the frozen rule; history remains readable and append-only. | no reopen; a later BAFO is a new round |
| `BLOCKED` | Common-state integrity, a round-level effect, safe advancement, or a Buyer round-level decision is unresolved. | `OPEN` or `WAITING` only after the blocker is resolved and revalidated |

A blocked lane does not set the whole round to `BLOCKED`. Set the whole round to `BLOCKED` only for the round-level conditions above. A clear lane-local send failure, decline, withdrawal, or timeout gets a lane disposition while other lanes continue when safe.

## Lane record and statuses

Use the smallest useful lane vocabulary:

`AWAITING_SEND`, `AWAITING_RECEIPT`, `AWAITING_RESPONSE`, `INCOMPLETE`, `CLARIFICATION_OUTSTANDING`, `COMPARABLE`, `DECLINED`, `WITHDRAWN`, `EXCLUDED`, `MISSED_DEADLINE`, `CONFLICTED`, `LATE`, and `BLOCKED`.

`COMPARABLE`, `DECLINED`, `WITHDRAWN`, `EXCLUDED`, `MISSED_DEADLINE`, and a resolved `INCOMPLETE`/`CONFLICTED` disposition are terminal for the current round. `LATE` records a message received after closure and does not reopen the round. `BLOCKED` is lane-local unless the cause is common or round-level. A lane may move from `AWAITING_RESPONSE` to `INCOMPLETE` or `CLARIFICATION_OUTSTANDING`, then to `COMPARABLE` or an explicit terminal disposition; it may move to `CONFLICTED` when evidence cannot be reconciled.

## Evidence and revisions

Every actual message evidence record includes mailbox-local `mailboxId` + `emailId`, thread ID when available, sender, recipient, subject, timestamp, direction, delivery state, scan/content state when exposed, and `in_reply_to`/source linkage when exposed. It also includes `sourcing_id`, `round_id`, supplier/lane ID, and `draft: false`. Draft records use `draft: true` and never enter commercial evidence.

An offer revision has a unique `revision_id`, source evidence IDs, `round_id`, sequence or timestamp, extracted field values, missing fields, and `supersedes_revision_id` when it is a valid successor. Revisions are append-only. The current offer is a pointer to the valid revision for the current round, not an overwrite of history. A message that adds or changes commercial terms creates a new revision; a pure confirmation can remain clarification evidence if it changes no term. A contradictory message preserves both claims, clears the current offer for the conflicting field, and sets the lane `CONFLICTED` until clarified or explicitly dispositioned. Multiple accepted on-time final revisions preserve all history but produce no effective commercial offer until the Buyer or frozen rules resolve the conflict.

The BAFO response creates a final revision in the BAFO round. It supersedes prior terms for BAFO evaluation only; INITIAL and earlier evidence remain traceable. A late revision after closure is appended as late historical evidence and cannot mutate the closed round's current offer.

## Deterministic helper interface

For local validation, `scripts/check-round-state.mjs` accepts one JSON object on stdin or from an input-file argument. Its required conceptual inputs are `sourcing_id`, `brief_version`, `brief`, `supplier_set`, `required_fields`, `evaluation_policy`, `disclosure_policy`, `round`, and `supplier_lanes`. Each lane may carry actual evidence, revisions, an optional source binding, disposition, clarification state, and effect state. A BAFO input additionally carries a closed `initial_round` and the frozen BAFO eligibility, requirement snapshot, deadline, final fields, and disclosure policy.

It returns deterministic JSON containing `valid`, `out_of_scope`, common-state echo, derived round status, sorted lane dispositions, missing fields, current revision pointers, draft/late evidence IDs, BAFO eligibility/openability, disclosure violations, recommendation readiness, and sorted errors/warnings. It never calls Mermail, creates drafts, sends mail, scores suppliers, or mutates an external state.
