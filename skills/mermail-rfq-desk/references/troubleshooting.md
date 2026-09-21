# Troubleshooting & dry-run — Mermail RFQ Desk

Common failure modes observed while building and exercising the desk, with the
behavior the skill prescribes. The fixtures in [fixtures/](fixtures/) double as
a no-send dry-run corpus: parse → score → render without touching a mailbox.

## Failure modes

| Symptom | Cause | Desk behavior |
| --- | --- | --- |
| Tool calls all fail at intake | `MERMAIL_API_KEY` unset or MCP server not connected | Stop before intake; report exactly which env var / server is missing. Never fake mailbox data. |
| `list_mailboxes` returns several matches | ambiguous mailbox resolution | Resolve by `public_id`; if still ambiguous, ask the owner. Never guess a sender identity. |
| Send result `pending`/unknown | transport hiccup | Report and wait. No retries — duplicate RFQs/rounds corrupt the audit trail. |
| `QUOTE-BLOCK` unparseable | vendor free-typed the reply | Score from the human-readable body; mark the field set `needs-owner-review` in the comparison matrix. |
| Reply has no `rfq-id` | vendor trimmed the block | Correlate by thread; a fresh unrelated thread quoting the RFQ is flagged, not merged. |
| Vendor reply arrives after `reply-by` | late quote | Record timestamp; inclusion is an owner decision, recorded either way. |
| Look-alike domain answers | spoof attempt | Flag in the matrix (`sender_authentication: unknown`); never auto-disqualify — owner decides. |

## Dry-run procedure (no email sent)

1. Read `fixtures/rfq-2026-003-thread.md` as if it were two vendor threads.
2. Extract both `QUOTE-BLOCK`s and any counter-round terms.
3. Score against the criteria weights stated in the fixture RFQ record.
4. Render the comparison matrix and compare, field by field, with
   `fixtures/expected-comparison-matrix.md`.

Any field mismatch is a parser or scoring regression: fix before touching a
real mailbox. This is the same corpus used to catch analyzer regressions in
review.
