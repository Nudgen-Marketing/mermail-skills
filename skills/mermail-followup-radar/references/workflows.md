# workflows.md — mermail-followup-radar

## Promise extraction

A promise is a sentence in your own sent message where you commit to a future
action toward the other party. Strong patterns:

- "I'll send you …" / "I'll have it to you by …"
- "Let me check and get back to you" / "I'll look into this"
- "Sending over … today / tomorrow / Friday"

Weak or excluded:

- Hedges ("I might", "we could", "let me think") — not a promise.
- Commitments made by the other party — their promise, not yours.
- Inbound claims that you promised something with no matching sent message —
  `needs_information`, reported with the exact quoted claim.

Dates: if explicit ("by Friday", "on the 15th"), use as-is. If relative
("next week", "tomorrow"), resolve against the message's date and mark
`derived`. If none, say so. Never invent a deadline to make the table
look better.

## Classification

| Class | Meaning |
|---|---|
| `awaiting_you` | Latest message is a direct question/request to you, unanswered |
| `promise_made` | You committed to a deliverable; no fulfillment visible in thread |
| `overdue` | Promise with a passed explicit date, or a revival promise gone silent |
| `clean` | Resolved, answered, no open commitment — not flagged |

## Urgency scoring

Order flagged threads: `overdue` first, then `due_soon` (deadline within 3
days), then `awaiting_you`, then other `promise_made` by recency. A thread
with no date never outranks one with a real deadline.

## Radar table

Render one row per flagged thread:

| Thread | Last activity | You owe | Deadline | Urgency |
|---|---|---|---|---|
| `<thread id>` | 2026-09-18 | quoted promise, one line | 2026-09-20 / derived / none | `overdue` |

Follow with one promise record per thread: the exact quoted sentence, who made
it, and what remains unfulfilled. Then one saved draft per thread, reported as
`draft_ready` with its draft reference.

## Continuation

If the user re-runs the radar later, compare against the previous radar state:
newly flagged, still open, resolved since last run. Do not re-draft threads
already drafted unless the thread has moved. A previous draft is never
authorization to send.
