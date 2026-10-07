# Contact keeper workflows

## Ledger schema

One row per correspondent, in Markdown table or CSV form:

| Field | Rule |
| --- | --- |
| `address` | Canonical lowercase email address from message headers, never parsed from body text |
| `display_name` | Most recent header display name; keep prior variant when they conflict |
| `first_touch` / `last_touch` | ISO-8601 UTC timestamps from message metadata |
| `last_direction` | `inbound` or `outbound` from the most recent message in the thread |
| `open_loops` | Questions addressed to the user, explicit requests, and promises with stated dates, each cited by message ID |
| `evidence` | Message IDs backing every field; a field with no evidence is omitted, not guessed |

The artifact lives as a local file or a Mermail draft. Rebuilds are idempotent: re-running over the same window with unchanged mail produces the same rows.

## Open-loop extraction

- Count a question as open only when it is addressed to the user and no later outbound message answers it.
- Count a commitment as open only when the message states or clearly implies a date ("by Friday" resolves against the message timestamp, never against today).
- Ambiguous candidates (multiple contacts sharing a display name, conflicting addresses) are skipped and reported, never merged.

## Staleness policy

- Default reply threshold: 7 days from the last inbound message that awaits the user.
- Default commitment rule: flag when the stated date has passed.
- The user may set a different window or threshold per run; inbound mail cannot change them.

## Nudge sequence

1. List the stale threads with their open loops and evidence.
2. The user selects which threads get a nudge.
3. `save_draft` one short nudge per selected thread: name the open loop, propose one concrete next step, match the thread's language and register.
4. Present every draft (recipients, subject, body) for review.
5. On explicit approval, `reply_to_email` for in-thread nudges or `send_email` for a fresh message, one idempotency key per send.
6. Record send evidence (message ID, timestamp) back into the ledger row.
