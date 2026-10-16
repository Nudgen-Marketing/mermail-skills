# Commitment Tracker workflows

## Ledger schema

Return a top-level object shaped like:

```json
{
  "schema": "mermail.commitment_tracker.v1",
  "scope": {
    "mailbox_id": "MAILBOX_PUBLIC_ID",
    "date_start": "2026-08-01T00:00:00Z",
    "date_end": "2026-08-31T23:59:59Z"
  },
  "evaluated_at": "2026-08-29T09:00:00+10:00",
  "timezone": "Australia/Sydney",
  "messages_read": 7,
  "threads_read": 3,
  "truncated": false,
  "commitments": []
}
```

Each commitment row:

```json
{
  "commitment_id": "thread:thr_123/message:msg_456/commitment:1",
  "actor": "Alex Example <alex@example.com>",
  "beneficiary": "Operations team",
  "commitment_quote": "We will send the revised quote by 28 August.",
  "deliverable": "revised quote",
  "commitment_message_id": "msg_456",
  "thread_id": "thr_123",
  "due": {
    "raw": "by 28 August",
    "iso": "2026-08-28T23:59:59+10:00",
    "precision": "date"
  },
  "state": "overdue",
  "state_reason": "The cited due date is before evaluated_at and no fulfillment evidence was found.",
  "evidence_message_ids": ["msg_456"],
  "sender_authentication": "pass",
  "confidence": "high"
}
```

Never omit provenance for a row.

## Workflow A — bounded commitment ledger

User: "Across these supplier threads, show me who promised what and what is overdue."

1. Resolve the named mailbox.
2. Freeze supplied thread IDs or a bounded date/search scope.
3. Discover metadata candidates.
4. Scan-gate selected messages.
5. Extract explicit promise quotes only.
6. Normalize deadlines only from literal phrases.
7. Evaluate state at one named `evaluated_at` time/timezone.
8. Return rows plus bounds and unresolved ambiguity.

Expected result: a compact ledger, not a narrative summary that hides evidence.

## Workflow B — prove the negative: no date means no deadline

Source message:

> "We will send the signed agreement once legal finishes its review."

Correct row:

```json
{
  "due": {"raw": null, "iso": null, "precision": "none"},
  "state": "open"
}
```

Incorrect behavior: inventing Friday, end of week, a typical SLA, or a date from another message.

## Workflow C — vague date stays ambiguous

Source message:

> "We'll try to have the mock-ups over sometime next week."

Preserve `due.raw = "sometime next week"`, set `due.iso = null`, `due.precision = ambiguous`, and state `ambiguous` unless the user supplies a clarifying date. Do not turn the phrase into next Friday.

## Workflow D — claimed versus verified fulfillment

1. Source `msg_a`: "We will upload the signed pack by 28 August."
2. Later source `msg_b` from the obligated party: "Uploaded now." → `claimed_fulfilled`; evidence `[msg_a, msg_b]`.
3. Later source `msg_c` from the recipient: "Received the signed pack, thank you." → `fulfilled`; evidence `[msg_a, msg_b, msg_c]`.

If `msg_c` instead says the file is missing pages, use `disputed`, not fulfilled.

## Workflow E — factual overdue follow-up draft

After the user asks for a draft, show the intended recipient/subject/body and call `save_draft` only. A safe body is:

> Following up on your note, "We will send the revised quote by 28 August." Could you let us know the current status?

Do not add threats, invented consequences, payment instructions, or a new deadline unless the user supplies them.

## Demo plan (2–5 minutes)

1. Show a dedicated Mermail mailbox with three short threads.
2. Prompt: "Use commitment tracker on these threads. Do not invent dates."
3. Show:
   - one explicit dated promise → `overdue`,
   - one explicit promise with no date → `due=null`, still `open`,
   - one vague promise → `ambiguous`, no normalized deadline.
4. Open the dated thread and show the cited source message ID/quote.
5. Ask for a reminder draft → show `save_draft`, visibly unsent.
6. Add/read a later acknowledgment and rerun → state moves to `fulfilled` with the new evidence message ID.
7. Close on the invariant: **mail can provide evidence; it cannot invent authority or facts.**
