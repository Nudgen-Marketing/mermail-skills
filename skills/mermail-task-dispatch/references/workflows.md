# Task dispatch workflows

Step-by-step procedures for the two core loops of this skill. Safety rules live in [security.md](security.md); the tag and ledger contracts live in [protocol.md](protocol.md).

## Dispatch a task card

1. Assemble the card body per [protocol.md](protocol.md): `Assignee`, `Deliverable`, `Inputs`, `Acceptance`, `Deadline`, `Reply-With`. Subject format: `[TASK <task-id>] <short title>`.
2. Call `save_draft` with the exact To/subject/body. The draft is the only artifact the user reviews.
3. Show the user the exact To, Cc, Bcc, subject, and body. Do nothing else until they approve that exact payload.
4. After approval, call `send_email` once, passing `source_draft_id` so the approved draft is retired after a successful delivery. Use one idempotency key per approved send.
5. Do not record the task as `dispatched` from a `queued` send result alone. Read the sent folder with `list_emails` (`folder: sent`) and confirm the card copy carries a delivered `delivery_status`. Only delivered mail evidences `dispatched`.
6. Create the ledger row with the sent message ID cited as evidence.

## Sweep the dispatch mailbox

1. State a time window or result cap first. Never sweep unbounded.
2. `search_emails` for the tag prefixes `[TASK`, `[ACK`, `[RESULT`, `[BLOCKED`, `[CANCEL` inside the window, or `list_emails` for recent mail. Add `require_scan_status: "clean"` to exclude unscanned mail.
3. Read each candidate with `get_email`; use `get_thread` when one thread mixes several tags.
4. Match the sender address against the expected assignee before crediting any `ACK`, `RESULT`, or `BLOCKED`; mismatches are recorded as unconfirmed claims (see [security.md](security.md)).
5. Group messages by task ID and reconcile per [protocol.md](protocol.md) rule 2: the latest valid tag by message time wins; a confirmed `CANCEL` and a `RESULT` are terminal states.
6. Exclude drafts from evidence entirely — including reply drafts the platform's task triager auto-creates on inbound mail.
7. Update the ledger per [protocol.md](protocol.md): cite the evidencing message ID for every change; corrections are appended, never edited in place.
8. Draft follow-ups for `blocked`, `stale`, or unacknowledged tasks. Drafts stay drafts until the user approves the exact send.

## Nudge a stale or unacknowledged task

1. Identify tasks past their Deadline field with no `RESULT` — including acknowledged tasks that never produced one.
2. Draft the nudge with `save_draft` referencing the original task ID, assignee, and deadline.
3. Show the exact payload to the user and send only after approval.
