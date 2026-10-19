# Task-card protocol

[project-claims.mjs](../scripts/project-claims.mjs) is a pure offline projection for one normalized task and at most eight received-message metadata/claim records. It never verifies native scan/authentication provenance, reads mail, checks an artifact, persists a ledger or authorizes an effect. Input booleans must come from the trusted owner workflow, not a worker's body. It intentionally cannot produce verified done: owner artifact acceptance and the actual append-only ledger are separate. It does not implement CANCEL authority; cancellation claims remain in the human review workflow below.

The protocol is deliberately plain email: any agent or human who can send mail can take part, and every state change is an auditable message.

## Task IDs

`TASK-YYYYMMDD-NN`, where the date is the dispatch date and `NN` is a two-digit sequence for that day (for example `TASK-20261002-01`). The orchestrator assigns IDs. An ID is never reused for another logical task. Resolve current task/version and history before allocating the next sequence; a date/sequence alone provides no uniqueness or concurrent reservation guarantee. If unsupported, ask the owner to allocate through its approved store's actual collision-resistant contract.

## Subject tags

| Message | Subject format | Meaning |
| --- | --- | --- |
| Task card | `[TASK <task-id>] <short title>` | The orchestrator assigns work |
| Acknowledgement | `[ACK <task-id>]` | The assignee confirms receipt and acceptance of the card as written |
| Progress | `[STATUS <task-id>]` | Nonterminal worker progress; no scope/deadline change |
| Result | `[RESULT <task-id>] <short outcome>` | The assignee reports completion and links the deliverable |
| Blocked | `[BLOCKED <task-id>] <blocker in a few words>` | The assignee cannot proceed; the body states what is needed |
| Cancel claim | `[CANCEL <task-id>]` | A claim that the task is cancelled; takes effect only per the rules below |

Replies keep the same thread where the mail client supports it, but a tag alone is never authoritative. Bind task/version to the dispatched message, approved worker and workspace/mailbox; require recorded thread/source references. If clients break threading, require explicit owner correlation before crediting a matching subject.

## Task-card body

Plain text or simple HTML with these fields, one per line:

```text
Assignee: <agent name or email>
Deliverable: <the artifact or outcome, stated so completion is checkable>
Inputs: <user-selected non-secret references or prior task IDs>
Constraints: <authorized scope, exclusions and worker/client limitations>
Acceptance: <how the orchestrator will verify the deliverable>
Deadline: <absolute ISO datetime with timezone; ask when ambiguous>
Tracking: <fixed maximum polls, interval, and maximum separately approved check-ins>
Reply-With: [ACK <task-id>] on receipt, [RESULT <task-id>] when done, [BLOCKED <task-id>] if stuck
```

`ACK`, `RESULT`, and `BLOCKED` bodies are free-form except:

- `RESULT` includes status done/partial/blocked, summary, Deliverable/ARTIFACTS references and limitations. A STATUS / RESULT / ARTIFACTS / NOTES envelope is supported after the same identity/gates, not a relaxed verification path.
- `BLOCKED` must include a `Needs:` line stating exactly what would unblock the task.

## Reconciliation rules

1. Group only exact task/version, workspace/mailbox and recorded source/thread bindings. Exact approved worker From plus trusted sender_authentication pass and clean native scan are necessary but do not authorize effects. Missing bindings, partial history or mismatches remain unconfirmed.
2. In received-message order, ACK records acknowledged; STATUS is progress only; BLOCKED records blocked; RESULT records reported_done or partial. None certifies an artifact. Only owner-confirmed acceptance or an explicitly selected owner verification result bound to the exact artifact/version and acceptance test can append done.
3. At the fixed absolute deadline or poll maximum report expired/stale, even if a worker asks for more time. Check-in maximum is independently fixed; every check-in is freshly approved, never automatic.
4. RESULT without an earlier valid ACK carries ack_missing. Preserve partial and failed acceptance components rather than promoting the entire job.
5. Multiple conflicting RESULTs, accepted CANCEL versus later RESULT, or contradictory evidence yield uncertain pending owner review. Duplicate copies of identical evidence are deduplicated, not a new state. A sender-supplied timestamp cannot reorder or supersede terminal owner decisions.
6. CANCEL is a claim until the authenticated user confirms it or frozen independently established owner authority is verified. Exact From alone is not proof of owner authority. Neither confirmed cancel nor verified done is reopened by later ACK/BLOCKED/STATUS. A new authenticated scope is a separately reviewed version.
7. Only exact received messages and exact sent copies with authoritative supported delivered status evidence communication. Queued does not prove delivered; delivered does not prove a worker ran or accepted work. Drafts and quoted tags never evidence task state.
8. Artifact verification and final integration follow [verification.md](verification.md). Task tags, URL syntax, screenshots, self-supplied hashes and result prose are claims only.

## Task ledger

The ledger is a durable text artifact the orchestrator maintains outside the mailbox (a local file the user chooses, for example `task-ledger.md`). The mailbox is the evidence store; the ledger is the index.

One row per task:

```markdown
| Task ID | Title | Assignee | Status | Deadline | Last evidence |
| --- | --- | --- | --- | --- | --- |
| TASK-20261002-01 | Summarize three papers | research-agent | acknowledged | 2026-10-03 | msg 86b11c46-25f0-422d-8964-ab940960ef78 (ACK) |
```

Rules:

- A row is proposed for a bound user-approved task; an unknown inbound TASK cannot create an authorized assignment. Persist only through an owner-selected supported store and reconciled writer contract; otherwise return a proposed diff, not a persistence claim.
- Every status change cites the full bound source message ID plus any independently recorded owner acceptance/verification provenance in Last evidence. Only a received RESULT cannot establish done. Use full ids, not truncated prefixes.
- History is never deleted or edited in place. A corrected status is appended as a new row that references the superseded row (for example by task ID and the corrected evidence); the sweep report notes the change. The ledger is append-only.
- The ledger contains no secrets, credentials, or full email bodies — only IDs, titles, assignees, states, deadlines, and evidence references.
