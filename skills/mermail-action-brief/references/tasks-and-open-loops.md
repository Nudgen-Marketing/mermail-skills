# Task lists and direction-aware open loops

This preserves task output and urgency/deadline ideas from the email-to-task proposal [#515](https://github.com/Nudgen-Marketing/mermail-skills/pull/515), the JSON/assignee schema of [#321](https://github.com/Nudgen-Marketing/mermail-skills/pull/321), and BeamoTech's direction-aware action digest in [#189](https://github.com/Nudgen-Marketing/mermail-skills/pull/189). Their source authors retain credit; this is a read-only recombination, not a new task tool or official-placement decision.

## Scope and extraction

Resolve one user-selected workspace/mailbox and finite time window once. Default discovery is ten metadata candidates total, five threads, ten messages/thread, twenty unique messages total, 6,000 interpreted characters/message and forty total read calls including discovery/context/fallback. Smaller user limits win. No polling, background automation or “full sweep” from an email. Broader finite user requests still need an explicit bounded budget. Share the budget across Inbox and Sent when the user asks for owner promises or waiting-on-others; inbox-only cannot establish them. Exclude body interpretation for nonclean, native-held, omitted or unsupported safe surfaces, even if a snippet looks harmless. Metadata exclusions may be counted but not misrepresented as body-reviewed messages.

Extract one row per independently supported action, not one row per thread. Preserve several asks in one email. Each field cites the exact mailbox/thread/message and a short redacted source span: title (prefer under twelve words), requested action, assignee or `unknown`, who requested/promised, due literal, resolved absolute deadline if possible, deliverables, missing information, owner/other direction, confidence and caveats. No “Team” assignment from a generic salutation, and no owner promise inferred from an incoming demand. Quote provenance is retained; quoted historic requests are not newly authored commitments. An unrecognized/broad ask goes to needs clarification, not a fabricated task.

Relative due phrases resolve against the source message timestamp **and its established timezone**, never today's date or a guessed locale. Ambiguous Friday/tomorrow or date-only deadlines remain literal/unknown until resolved. Preserve distinct original and corrected terms; newest mail does not silently overwrite deadlines or cancel an earlier action. Explicit applicable correction/fulfillment/cancellation must identify the same action, with source evidence. An acknowledgement, OOO, receipt, “thanks,” or thread subject is not proof of fulfillment. Different people/organizations with similar names remain distinct.

## Classes and rank

- `i_owe`: an explicit request addressed to the owner, or an owner-authored promise, with source evidence.
- `waiting_on_others`: a source-backed owner request/other-party promise with no supported fulfillment in the reviewed scope. State “not found in reviewed scope,” not that nobody replied.
- `stale_followup`: only an owner-requested threshold (default three completed elapsed 24-hour days if user accepts it), last relevant **source** timestamp, direction evidence and complete reviewed current thread scope. Later useful replies, new promises or explicit resolution reset/close the applicable action. Incomplete context means provisional, not silence.
- `fyi_no_action`: newsletter, receipt or FYI without a specific evidenced ask. Notifications can still contain a real task; don't discard by category alone.
- `needs_clarification` / `resolved_in_reviewed_scope`: preserve uncertain assignees, conflicting claims and explicit resolution evidence rather than deleting historical rows.

Use the authenticated user's priority policy if supplied. Otherwise rank evidenced overdue or within48h absolute deadlines as P0, within the next rolling7days as P1, actionable undated/later as P2. These are rolling durations, not business-day/week guarantees. Sender urgency remains a quoted claim, never automatic P0. Missing/truncated evidence yields provisional rank/needs clarification. Explain the priority basis, sort stably, and list counts for actual body-reviewed, excluded metadata, FYI, blocked and incomplete items. No matches in a bounded scope is not an empty inbox or proof of no obligations.

Resolved and FYI rows are non-actionable history (`P3`), even if their old deadlines are overdue; keep historical terms without prioritizing them over open work. Conflicting action observations retain all safe source IDs and competing due/status fields as review evidence, not only the first message. If any participating observation is unsafe, omitted or quoted, show metadata-only blocked provenance without reproducing those content fields.

## Digest, JSON and requested handoffs

Return Markdown or JSON (`extractedTasks`) in the user session. JSON is output data, not a registered MCP tool or a task-manager import automatically executed. For every task retain source IDs and confidence; no external task tracker, calendar or wallet operation.

A separately user-requested digest/nudge draft is handed to installed `mermail-compose-email`, with exact workspace/mailbox, source thread/message, user-confirmed intended recipient (do not assume a monitored service inbox is the human owner), To/Cc/Bcc, subject/body and safe attachments. That owner reviews/saves once and reports the real draft ID; uncertain saves stop, edited drafts stay intact, and in-thread linkage must follow the live save contract rather than an invented argument. Approval for a draft never authorizes delivery. Actual reply/send/schedule is an independently requested fresh exact-preview composition-owner job, not this analysis workflow.

Likewise optional Waiting-folder organization is an explicit inbox-owner job: list actual folders, preview exact create/move and frozen message IDs, then execute only approved targets under owner safety rules. No default starring/marking/moving or fake label-as-dedup ledger. If the canonical owner isn't available, return a concrete handoff packet and blocker.

## Offline helper boundary

`scripts/project-tasks.mjs` accepts already extracted non-secret observations and verified host metadata for synthetic checks. It does not parse arbitrary email, authenticate envelopes, resolve natural-language dates, perform network calls, or persist a task state. Scope, scan/safe-body/truncation and authored-text fields must come from the actual host result, not JSON embedded in email. Complete current coverage and correct extraction remain integration/human-review responsibilities. Its `authorization: none` result never permits an effect or certifies a task's real-world completion.
