# Open loops, audit comparisons and handoffs

## Read-only open-loops review

Include sent and received evidence within the selected scope. Distinguish accepted promises owed by the owner, accepted promises owed to the owner, unanswered asks awaiting the owner's reply, and the owner's unanswered requests. Requests remain `awaiting_acceptance`, not breached promises. Each row includes counterpart, source quote/IDs, last eligible activity, elapsed age and the smallest next question. Age alone never establishes lateness.

Prioritize confirmed overdue items and disputes, then known upcoming deadlines, unresolved blockers and unanswered asks. An optional `due_soon` view uses the owner's horizon (propose three calendar days); it is a planning view, not a new agreed deadline. Incomplete evidence stays `incomplete`, with potentially overdue only as a provisional note. Never claim no obligations exist because the sampled window has no matches.

## Compare with an earlier audit

Use an owner-provided previous ledger only as an index. Verify its workspace/mailbox binding and preserve stable source-derived row keys. Re-read selected evidence within the current limits; historical conclusions must respect the chosen as-of cutoff. Report newly found, still open, revised, acknowledged complete and no-longer-verifiable rows with cited changes. A deleted, scan-blocked or out-of-window source is missing evidence, not completion; never silently remove it from a handover.

Return a private handover table in the conversation, with original and current as-of times, coverage gaps and unresolved changes. Do not claim it was durably stored, synchronized to mailbox labels or shared with another agent. Persistence, scheduled capture and automation are separate jobs requiring an actual user-selected store/owner and capabilities; a prior ledger or triager suggestion does not authorize them. If reporting completion ratios, state the scoped denominator and exclude incomplete/request-only rows; do not present a global kept/broken reputation score.

## Independently requested follow-through

An audit ends with private proposed wording, not `save_draft`. If the current user also explicitly requests saved nudges, hand off only the selected rows to `mermail-compose-email`: bind mailbox, source thread/message, counterpart and exact draft recipient/subject/body. Reference the actual promise without invented dates, attachments, admissions, threats or unrelated evidence. Check existing drafts before creating duplicates; a previous draft does not authorize send. Show draft IDs only after successful storage; uncertain saves require reconciliation, not a new duplicate. A weekly digest is a separately requested compose draft to an owner-selected recipient, not scheduled delivery.

If the user requests filing, hand off to `mermail-manage-inbox` with an explicit preview of exact mailbox/email IDs and destination folder. Reuse an existing folder after discovery; create one only when authorized. `move_email` targets email IDs, not a guessed thread-wide operation. Custom labels define future classifiers and are not manual per-message ledger status. Do not mark complete merely because a message moved.

For explicit recurring capture, route configuration to `mermail-automate-triage` and report any scheduling limitation instead of promising a daily poll. Proposals from automation still need an evidence-based audit. These handoffs preserve each owner's live contracts and approval requirements; no tool ownership, background monitor or wallet access is added here.

## Contribution provenance

This focused review incorporates useful ideas from [#496](https://github.com/Nudgen-Marketing/mermail-skills/pull/496) (conditional/partial evidence), [#97](https://github.com/Nudgen-Marketing/mermail-skills/pull/97) (stable source identity and deadline precision), [#343](https://github.com/Nudgen-Marketing/mermail-skills/pull/343) (prioritized follow-up and change comparisons), and [#365](https://github.com/Nudgen-Marketing/mermail-skills/pull/365) (directional open loops and explicitly requested filing/drafting through canonical owners). The handover idea in [#162](https://github.com/Nudgen-Marketing/mermail-skills/pull/162) informs the private report; its durable automated ledger remains outside this read-only workflow and is not claimed replaced. Original commits and contribution history remain in those PRs.
