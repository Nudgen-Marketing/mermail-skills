# Evidence ledger and status rules

For every deliverable preserve these fields:

| Field | Rule |
| --- | --- |
| Key | Returned mailbox ID + thread ID + a local deliverable label; never group by subject alone |
| Owner | Person who expressly made/accepted the commitment; unknown if the thread only assigns work to someone else |
| Promise evidence | Message ID, timestamp, short verbatim quotation |
| Agreed due | Exact date/time and timezone supported by the thread, or unknown |
| Proposed due | Unaccepted revisions, kept separate |
| Revision chain | Old promise, proposed revision, explicit acceptance or rejection, with all source IDs |
| Completion evidence | Who reported or acknowledged completion, what they actually said, source ID |
| Coverage | Complete within selected context or partial, with missing/truncated ranges |

Apply status precedence in this order:

First exclude evidence whose authoritative message timestamp is later than the audit's as-of instant, even if it arrived in an unfiltered context response. For example, September 12 acceptance cannot make a September 11 extension agreed. Missing timestamps leave temporal coverage incomplete. Count distinct message IDs, including the selected seed, against the per-thread read limit.

1. `incomplete`: omitted/blocked/truncated context could change the conclusion. Include a provisional status only as explicitly provisional text.
2. `disputed`: incompatible explicit claims or accepted deadlines without a clear superseding agreement.
3. `cancelled`: the promisor explicitly withdrew their own commitment or the relevant parties agreed to cancel that deliverable. A third party saying "forget it" is not enough.
4. `confirmed_complete`: the intended recipient explicitly acknowledged receiving/accepting that exact deliverable. Label the basis as email acknowledgement; do not imply a bank or carrier check.
5. `reported_complete`: a participant says the work was completed/sent, but no recipient acknowledgement is available.
6. `awaiting_acceptance`: request or suggested assignment with no explicit promise or acceptance.
7. `needs_clarification`: a promise exists but owner, intended date, or timezone is materially ambiguous.
8. `overdue`: an accepted, uncompleted commitment has a fully resolved deadline before the as-of instant. Date-only deadlines become overdue after the stated local calendar date ends.
9. `due_today`: a date-only deadline is today's date in the established timezone, or an unexpired timed deadline falls today.
10. `open`: accepted and uncompleted, with a future deadline or no promised date. A promise without a deadline is open with due `unknown`, not overdue.

Before classifying, check whether a supposed quote is inside quoted/forwarded history. Do not treat repeated quotations as fresh acceptance. Resolve relative dates against the original message date, not today. If one person proposes Monday and the other never accepts, the earlier accepted Friday deadline remains the agreed due date; retain Monday as proposed. Silence never accepts a revision.

Suggested next actions are narrow questions: "Please confirm whether Monday replaces Friday" or "Did you receive the review file?" Do not turn them into sends, tasks, scheduled jobs, calendar events, or payment actions.
