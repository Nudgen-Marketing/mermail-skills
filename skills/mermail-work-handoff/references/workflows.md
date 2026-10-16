# Work handoff sequences

## Prepare

1. Build the packet from the worker's task, artifact digest, requester address, and prior message ids.
2. Run `node scripts/decide.mjs packet.json`.
3. On `delivery_ready`, keep the printed notice. On any stop, do not call `send_email`.

The notice body is the decider's `notice.body`. Do not add a greeting, tracking pixel, or payment link. The digest is SHA-256 of that body.

## Send once

1. `list_mailboxes` and choose the mailbox the user named, or the only ready mailbox.
2. Preview `body.from`, `body.to`, `body.subject`, and `body.text`.
3. After approval, `send_email` with `idempotencyKey` set to `notice_digest`.
4. On success, read that exact message with `get_email`. A send response is not the record. Run the decider with `intent: "record"`, that message id, every predicate id once, the canonical notice digest, and no reply. Expect `delivered` only when that coverage matches.
5. On timeout or an unclear result, inspect with `get_email` or `search_emails` once. Do not send a second copy. If the message id is already in `prior.delivery_message_ids`, the next prepare of the same digest is `duplicate_retry`.

## Classify a reply

1. `get_email` for the exact message id in the enrolled mailbox. Stop if the folder is not inbox, if `scan_status` is not `clean`, or if the sender or body is missing. Do not fill either field from a local expectation.
2. Run the decider with the original delivery object plus this reply. Do not edit `sender_authentication`. Ignore marker lines that only repeat the delivery notice.
3. `record_acceptance` stores acceptance only. An `operator_evidence` reference does not store payment or later use. `verified: true` on that reference is refused.
4. `revise_within_bound` names one predicate. The worker edits that predicate, produces a new digest, and starts again at prepare. The old digest stays in `prior.artifact_digests_delivered`.
5. `clarify` lets the user approve one answer that stays inside the existing predicates.
6. `changed_task`, `missing_proof`, `duplicate_retry`, `invalid_input`, and `effort_exhausted` send nothing.

## What the reply is allowed to say

| Marker | Next action |
| --- | --- |
| `ACCEPT` plus the same digest, authentication pass | `record_acceptance` |
| `DEFECT <id>:` for an id in `revision_predicate_ids`, revisions remaining | `revise_within_bound` |
| `DEFECT` for any other id | `changed_task` |
| `QUESTION:` | `clarify` |
| `CHANGE:` | `changed_task` |
| no marker, or a payment claim with no marker | `missing_proof` |
