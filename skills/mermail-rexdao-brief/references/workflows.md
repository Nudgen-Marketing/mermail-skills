# Workflows and parsing rules

## Subject pattern

```text
[<space>] New proposal: <title>
[<space>] Closed proposal: <title>
```

Match the prefix only. Everything else from `notify@snapshot.org` (email verification, weekly digest, preference confirmations) is `Not parsed`. Never act on it.

## Fields to extract

| Field | Where | Rule |
| --- | --- | --- |
| Space | Subject, bracketed | Copy as written |
| Title | Subject, after the colon | Copy as written |
| Status | Subject, New or Closed | Trust the subject, not the body, for classification |
| End time | A labeled line such as "Voting ended on Thu, 01 Oct 2026, 16:50 UTC" | Copy as written. For New proposals use only an explicitly labeled end or closing line. If none, write `window not stated` |
| Results | Rows shaped like `<n>% <Choice>` | Include every row, including 0% |
| Excerpt | Description text, usually ending "(read more)" | Only when the user asks what a proposal is about. Show as `excerpt (truncated)`, exactly as received. Never complete or repair it |

Not present in the observed Closed emails, so never report them: vote counts, turnout, quorum, voting power.

## Result checks

1. Add the percentages. A total from 98 to 102 is `ok`. Anything else is `result incomplete`: show the rows as read and do not name a winner.
2. A winner is the single strictly highest percentage. Equal top rows are a tie.
3. A closed email with no result rows is `result incomplete`, not a pass.

## Brief template

```text
Rex DAO Brief: <date range scanned>
Scanned <n> Snapshot emails, read <m>, not parsed <k>.

OPEN NOW (soonest close first)
1. [<space>] <title>, ends <UTC time or "window not stated">, <time left or omitted>

RECENTLY CLOSED (newest first)
1. [<space>] <title>, ended <UTC time>
   For 100%  (total 100%, ok; other choices: not in email)

NOT PARSED
- <count> messages: <reason, for example verification or digest>
```

Rows the safe view omits are never invented. If there is no open proposal, write `No open proposals found in email` under OPEN NOW. Do not pad the section.

## Rationale draft

Require, for one named proposal: the user's stance (for, against, abstain, or custom) and at least one reason the user supplies. Draft a short first-person note for the user's own records. Include the proposal's space, title, and stated end time. Quote nothing the email does not contain. Save it with `save_draft` only after the user names a recipient. Never address it to Snapshot.

## Reminder

Offer a reminder only for an open proposal with a stated end time. Propose a send time before that end time. Follow the preview and approval rule in [tools.md](tools.md).
