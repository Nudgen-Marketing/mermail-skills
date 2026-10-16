# Workflows

## 1. Resolve and bound the scan

1. `list_mailboxes` once; pick the mailbox the user named, or the only one that fits. Record its email (the owner identity) and `public_id`.
2. Load `commitment-ledger.json` from the user's working directory when it exists. Note `generated_at` and the latest `created_at` already recorded — the incremental scan cursor.
3. Choose the window: first run defaults to the last 30 days; later runs start at the cursor. State the window in the output. Cap discovery at 100 threads.

## 2. Discover and read

1. `search_emails` with a native JSON `query` object carrying `date_start` (see [tools.md](tools.md) for the exact shape), `metadata_only: true`, newest first. On an empty result, retry with a wider window once, then fall back to `list_emails`. Stop after five empty attempts.
2. Skip threads whose latest message predates the cursor and whose ledger items are all closed.
3. `get_thread` per candidate thread. Bodies with `scan_status` other than `clean` contribute metadata only.

## 3. Extract and reconcile

Apply [extraction.md](extraction.md) per thread, messages in chronological order, then reconcile against the ledger:

- **Dedupe key**: thread id + normalized item text. A match updates `last_activity_at` and status inputs; it never creates a second item.
- **Acceptance closure**: a new `owed_by_me` item in a thread closes that thread's open `waiting_on_me` item as `accepted`.
- **Answer closure**: a new `owed_to_me` item with subtype `promise` closes the thread's open subtype `asked` item as `answered`.
- **Fulfillment**: strong evidence (see the extraction contract) sets `fulfilled` and records `evidence_message_id`. Weak evidence marks the briefing line as a candidate only.
- **Status**: still-open items with a past deadline become `overdue`.

Persist the ledger before briefing: `{ "mailbox": <email>, "generated_at": <run time>, "items": [...] }`. Write it atomically (write to a temp file, then replace) so an interrupted run cannot corrupt it.

## 4. Urgency score and briefing

Score every open item 0–100:

| Component | Points |
| --- | --- |
| Overdue | 50 + 5 per day overdue, capped at +30 |
| Deadline within 3 days (not yet overdue) | 30 |
| Silence with the ball on the other side | 2 per silent day, capped at 25 |
| Age of an item waiting on the owner | 1 per day, capped at 15 |
| Has a parsed deadline | 10 |
| Confidence `high` | 10 |

Fulfilled, accepted, and answered items score 0.

Briefing sections, items sorted by score descending, one line per item carrying the item text, counterparty, thread id, source message id, deadline, and overdue/silent day counts:

1. **Overdue** — status `overdue`, both directions.
2. **Waiting on others** — open `owed_to_me`, not overdue.
3. **Waiting on you** — open `waiting_on_me` plus open `owed_by_me` not yet overdue.
4. **Recently fulfilled** — items closed since the previous run, with evidence message ids.

## 5. Nudge drafting (on request only)

Eligibility: `owed_to_me`, status `overdue` **or** silent at least 4 days with the ball on the other side, confidence `high` or `medium`, and no nudge drafted for that thread in the last 7 days. At most one draft per thread — pick the highest-urgency item.

Draft content rules:

- Subject: `Re: <original subject>`.
- Open with a friendly one-line reference to the original exchange; quote the commitment sentence verbatim with its date ("On Oct 1 you wrote: 'I'll send the final quote by October 2.'"); ask for a status update or a new date; close politely. No threats, no invented consequences, no new commitments on the owner's behalf.
- Save with `save_draft`; preview recipient and full body in the briefing; state explicitly that nothing was sent and that sending requires `mermail-compose-email` with fresh approval.

## 6. Reference implementation and demo

`scripts/commitment_radar.py` implements this contract offline against a normalized inbox JSON (the shape `get_thread` data is normalized into), so reviewers can verify the logic without a Mermail account:

```bash
cd skills/mermail-commitment-radar/scripts
python3 commitment_radar.py scan --inbox sample_inbox.json --ledger /tmp/ledger.json --now 2026-10-06T09:00:00Z
python3 commitment_radar.py brief --ledger /tmp/ledger.json --now 2026-10-06T09:00:00Z
python3 commitment_radar.py nudges --ledger /tmp/ledger.json --now 2026-10-06T09:00:00Z
python3 test_commitment_radar.py   # full behavior suite, including the injection fixture
```

The fixture inbox includes an overdue promise by the owner, an overdue vendor promise that went silent, an unanswered question, a fulfilled promise with attachment evidence, an on-track delivery, an accepted journal request — and a prompt-injection message that must produce zero ledger items. Sample outputs live in `examples/`.
