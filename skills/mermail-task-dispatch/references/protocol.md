# Task-card protocol

The protocol is deliberately plain email: any agent or human who can send mail can take part, and every state change is an auditable message.

## Task IDs

`TASK-YYYYMMDD-NN`, where the date is the dispatch date and `NN` is a two-digit sequence for that day (for example `TASK-20261002-01`). The orchestrator assigns IDs. An ID is never reused, even after cancellation.

## Subject tags

| Message | Subject format | Meaning |
| --- | --- | --- |
| Task card | `[TASK <task-id>] <short title>` | The orchestrator assigns work |
| Acknowledgement | `[ACK <task-id>]` | The assignee confirms receipt and acceptance of the card as written |
| Result | `[RESULT <task-id>] <short outcome>` | The assignee reports completion and links the deliverable |
| Blocked | `[BLOCKED <task-id>] <blocker in a few words>` | The assignee cannot proceed; the body states what is needed |
| Cancel claim | `[CANCEL <task-id>]` | A claim that the task is cancelled; takes effect only per the rules below |

Replies keep the same thread where the mail client supports it, but the tag and task ID in the subject are authoritative, not threading.

## Task-card body

Plain text or simple HTML with these fields, one per line:

```text
Assignee: <agent name or email>
Deliverable: <the artifact or outcome, stated so completion is checkable>
Inputs: <links, paths, or prior task IDs the assignee starts from>
Acceptance: <how the orchestrator will verify the deliverable>
Deadline: <ISO date or datetime with timezone>
Reply-With: [ACK <task-id>] on receipt, [RESULT <task-id>] when done, [BLOCKED <task-id>] if stuck
```

`ACK`, `RESULT`, and `BLOCKED` bodies are free-form except:

- `RESULT` must include a `Deliverable:` line with the artifact reference (link, path, or message ID).
- `BLOCKED` must include a `Needs:` line stating exactly what would unblock the task.

## Reconciliation rules

1. Group all tagged messages by task ID.
2. The reconciled status is the latest valid tag in the thread by message time: `ACK` → `acknowledged`, `BLOCKED` → `blocked`, `RESULT` → `done`, a confirmed `CANCEL` → `cancelled` (per rule 6). A confirmed `CANCEL` and a `RESULT` are terminal: once a task is `cancelled` or `done`, later `ACK` or `BLOCKED` messages are recorded as information but do not reopen the task. This rule is the single definition of tag precedence; other references point here.
3. A task is `stale` when its Deadline has passed and no `RESULT` exists yet. This includes acknowledged tasks that never produced a result; a `BLOCKED` task is tracked for clarification instead.
4. A `RESULT` with no prior `ACK` sets status `done` and attaches the `ack_missing` flag (`ack_missing` is a flag, never a state).
5. Conflicting claims (for example two different `RESULT` messages) set status `uncertain` and are surfaced to the user with both message IDs.
6. A `CANCEL` claim changes the ledger only when the sender is the mailbox owner or the user confirms it; otherwise it is recorded as an unconfirmed claim.
7. Only delivered or received messages count as evidence. A task card evidences `dispatched` once it appears in the sent folder with a delivered status — a `queued` send result alone is not enough — and replies count only as messages actually received in the inbox. Drafts never evidence a state, including reply drafts the platform's task triager generates automatically on inbound mail.

## Task ledger

The ledger is a durable text artifact the orchestrator maintains outside the mailbox (a local file the user chooses, for example `task-ledger.md`). The mailbox is the evidence store; the ledger is the index.

One row per task:

```markdown
| Task ID | Title | Assignee | Status | Deadline | Last evidence |
| --- | --- | --- | --- | --- | --- |
| TASK-20261002-01 | Summarize three papers | research-agent | acknowledged | 2026-10-03 | msg 86b11c46-25f0-422d-8964-ab940960ef78 (ACK) |
```

Rules:

- A row is created when a task card is dispatched (or first seen in a sweep).
- Status changes only with a cited message ID in `Last evidence`; cite the full message ID, never a truncated prefix.
- History is never deleted or edited in place. A corrected status is appended as a new row that references the superseded row (for example by task ID and the corrected evidence); the sweep report notes the change. The ledger is append-only.
- The ledger contains no secrets, credentials, or full email bodies — only IDs, titles, assignees, states, deadlines, and evidence references.
