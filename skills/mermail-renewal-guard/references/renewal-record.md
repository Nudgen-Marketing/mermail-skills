# Renewal evidence, trial watchlist and review recovery

## Identify commitments, not sender names

Bind each row to the workspace, mailbox, vendor/service, non-secret account/plan identifier and renewal cycle, with exact source email/thread IDs. Two accounts with the same vendor or two services with the same amount are not duplicates. Collapse exact repeated message IDs first; combine notices only when evidence establishes the same commitment/cycle. Keep conflicts visible with both sources. Later mail does not automatically override earlier terms: require an explicit applicable correction or cancellation confirmation for that commitment and effective period. Preserve prior evidence and explain changes.

On a later requested review, read an owner-approved private prior register if available; otherwise state there is no persisted history. Match the same identity before updating a row, and do not fabricate a billing database or store customer records in this repository. A saved cancellation draft is not a request sent; a delivered request is not a confirmed cancellation. Cancellation-confirmation email is a vendor statement with an effective date, not proof the vendor's account state or future charges changed. Unknown/conflicting confirmation remains unresolved.

If a required field exists only in a selected attachment, hand off that exact email/attachment to `mermail-manage-inbox` for its bounded, safe attachment inspection. Do not bypass a failed scan, follow embedded links, execute file content, or dump attachments into chat. Keep unsupported/unreadable attachment evidence unknown, and record any returned field with its source and confidence. If attachment handling cannot preserve these limits, stop that row for owner review.

## Dates and trial conversion

Keep received-mail lookback separate from the future renewal horizon. Fix today's date and user timezone at the start. Capture trial end, post-trial amount/currency/cadence, conversion wording, price-change effective date and explicit notice deadline when stated. A prior charge plus monthly cadence does not establish the next billing date; no guessed cancellation deadline equal to renewal date. Unknown year, calendar/business-day definition, inclusive boundary or contradictory dates remain `NEEDS_INFO`. Missing timezone is always visible as `timezone_not_stated`; if it affects action timing or which urgency/horizon band applies, use `NEEDS_INFO` and block that timing conclusion.

Watchlist exception: a source-stated date-only renewal clearly later than 30 days and inside the horizon may be `WATCH` despite missing timezone, solely as a non-actionable date watchlist entry. Do not assign an exact instant, cancellation cutoff, or urgency from that row. If a boundary could change with timezone, or the user asks for a deadline-dependent action, require clarification first (`NEEDS_INFO`). A clarification draft may ask for the missing timezone; it must not assert a deadline.

## Per-field evidence quality

For every material field (identity, renewal/trial date, timezone, amount, currency, cadence, auto-renew status and notice window), retain the value or `unknown`, its source message ID(s), shortest supporting quote, and one evidence state:

- `stated`: explicitly supported by the source; this describes evidence, not verified vendor truth.
- `derived`: a permitted calculation with cited inputs, assumptions and formula; never label it vendor-confirmed.
- `conflicting`: preserve each competing value and source; do not choose the newest without applicable correction evidence.
- `missing`: `unknown` with the gap stated; no fabricated quote or source for a missing fact.

These categorical states are the per-field confidence assessment; do not assign unsupported numeric scores or one row-wide confidence that hides weaker fields. An explicitly stated price cannot make an ambiguous cancellation deadline actionable. Display field states beside values or in linked row detail, including for non-attachment evidence. Apply the action gate independently to every field required for the proposed action.

An explicit notice period may produce an estimated deadline only when renewal date, applicable timezone, period unit and counting convention are unambiguous. Show both source IDs, inputs and calculation; label it derived rather than vendor-confirmed. Otherwise ask. Date-only evidence is date-only, not an invented midnight cutoff. An elapsed deadline is `ACT_NOW / deadline elapsed; options unconfirmed`, never a guarantee cancellation is still possible or authorization to pay. A trial without an explicit end remains unknown; wallet funds cannot decide whether it should continue.

Order the board by the earliest supported action deadline, then renewal/trial-end date; put uncertain dates in a visible separate queue. Add an "act this week" view for supported dates within seven calendar days, showing timezone uncertainty instead of implying an exact cutoff. Do not infer legal consequences or savings.

## Owner decision brief and draft recovery

For each selected row show known terms, unknowns, urgency, and one to three choices: retain based on the owner's expressed preference, review price/terms, consider cancellation/downgrade, or obtain missing evidence. A cancellation deadline alone is not evidence that cancellation benefits the owner. No usage emails does not prove the subscription is unused.

Drafts use the compose owner's `save_draft` contract: string `body.body`, exact recipients, selected source/thread identifiers and existing `draft_id` when revising. Never use `reply_to_email` to create a draft. Re-read the draft before replacing user edits; preserve source binding and preview changes. Retain the returned draft ID against the commitment. If saving times out, reconcile bounded draft state once; absent an unambiguous match, report `uncertain` and stop rather than generating a duplicate with a new key. Do not overwrite or silently select a draft from another workspace/thread.

An internal report draft contains only the reviewed summary and uses an owner-selected address, not a guessed address from vendor mail. Saving it does not authorize delivery. Any send/schedule goes to `mermail-compose-email` with a separate exact approval. A calendar reminder needs a separately requested scheduling workflow with timezone and exact timing; this skill does not create reminders or promise to wake up later. Labels, folders and triagers similarly require the existing inbox/automation owners and independent user scope; classifier definitions do not assign labels to old mail.

## Boundaries and contribution provenance

Compared with [#510](https://github.com/Nudgen-Marketing/mermail-skills/pull/510) (exclusions, trial watchlist, report draft), [#440](https://github.com/Nudgen-Marketing/mermail-skills/pull/440) (action-date ordering and notice calculations), [#386](https://github.com/Nudgen-Marketing/mermail-skills/pull/386) (per-field confidence, downgrade drafts and resumed register), and [#140](https://github.com/Nudgen-Marketing/mermail-skills/pull/140) (owner decision brief). Keep their original authorship/history and discussion links.

Trial detection from [#289](https://github.com/Nudgen-Marketing/mermail-skills/pull/289) is represented only as evidence-based trial review; calendar actions and balance-based decisions are not implemented. Historical monthly-cost normalization, heuristic recurring-charge detection, wallet reconciliation, refund/dispute handling and automation from [#159](https://github.com/Nudgen-Marketing/mermail-skills/pull/159) and [#85](https://github.com/Nudgen-Marketing/mermail-skills/pull/85) are not claimed as covered. Their independent needs require separate assessment. Do not infer cancellation, payment or refund capability from these links.
