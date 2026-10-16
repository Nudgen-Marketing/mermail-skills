# Extraction contract

Extraction turns thread text into ledger items. The agent performs extraction
with its own language understanding, guided by this contract; the reference
implementation in [scripts/commitment_radar.py](../scripts/commitment_radar.py)
implements the same contract with deterministic rules so the behavior can be
tested offline. Where the two disagree, this contract wins and the
implementation is the bug.

## Item types and direction

Direction is decided by the mailbox owner (the resolved mailbox's email), never
by body text.

| Signal in newest content | From owner (sent) | From counterparty (received) |
| --- | --- | --- |
| Explicit promise ("I'll send…", "we will deliver…", "I'm preparing…") | `owed_by_me` | `owed_to_me`, subtype `promise` |
| Request or question ("please send…", "could you…", a direct question) | `owed_to_me`, subtype `asked` | `waiting_on_me` |

- The item text is the verbatim sentence that carried the signal, whitespace-normalized. One sentence, one item; a sentence with a promise and a deadline is one item with a deadline, not two items.
- Newsletters, automated notifications, receipts, and calendar invites create no items unless they contain a human commitment sentence from a thread participant.
- A counterparty's assertion about the owner's promise ("per your promise…") creates a **claim**, recorded as `waiting_on_me` at low confidence with the text prefixed by the claim source, until the owner's sent mail confirms it (see [security.md](security.md)).

## What counts as a commitment

- First-person future commitment by the speaker about a concrete deliverable, answer, or action: "I'll send the dataset", "we'll deliver the annotations".
- Not commitments: vague intent ("we should catch up"), third-party plans ("the venue will confirm"), conditional offers ("if you want, I can…") — these are `low` confidence mentions for the briefing only, never nudged.
- An owner's reply that accepts a request ("sounds good, I'll confirm by Thursday") both creates an `owed_by_me` item and closes the thread's open `waiting_on_me` item as `accepted`.

## Deadline parsing

Extract a deadline only from the commitment's own message. Resolve relative expressions against the message date:

| Expression | Resolution |
| --- | --- |
| ISO date (`2026-11-01`) | that date |
| Month name + day ("by October 3") | that date in the message's year (next year if it fell more than 180 days before the message) |
| Weekday ("by Friday") | next occurrence strictly after the message date (same weekday means +7 days) |
| "tomorrow" | message date + 1 day |
| "next week" | message date + 7 days |
| "today", "EOD", "end of day" | message date |
| "end of week" | the Friday of the message's week |

No recognizable expression means no deadline (`null`), never a guessed one. Store the raw phrase alongside the resolved date in the item's text context when presenting it.

## Confidence

- `high`: explicit promise pattern **and** a parsed deadline.
- `medium`: explicit promise without a deadline, or a request with a deadline.
- `low`: everything else that still qualifies (requests without deadlines, counterparty claims, conditional mentions).

Only `high` and `medium` items are eligible for nudge drafts.

## Fulfillment evidence

An open `owed_by_me` or `owed_to_me` (subtype `promise`) item becomes
`fulfilled` only when a later message in the same thread, from the owing party,
shows delivery:

- **Strong signals (auto-close, record `evidence_message_id`)**: the message carries a non-empty attachment list, or its newest content matches a delivery cue ("here is the…", "attached", "sent you", "delivered", "as promised"), or the other party explicitly confirms receipt ("received, thanks", "got it, thank you").
- **Weak signals (never auto-close)**: the owing party replies substantively without delivery cues, or the topic moves on. Surface these in the briefing as `fulfilled-candidate` and let the user confirm.

Status at briefing time for items still open: `overdue` when a deadline exists and is before today; otherwise `open`, annotated with days since the thread's last activity and who holds the ball.

## Thread state

For every item, record `last_activity_at` (latest message date in its thread) and `ball`: `me` for `owed_by_me` and `waiting_on_me`, `them` for `owed_to_me`. Silence is measured from `last_activity_at` to the run's date; an item is "going silent" when the ball is with the other side and silence reaches 4 days.
