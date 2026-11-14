# Incident brief workflows

## Source selection

1. Resolve the authenticated workspace and one usable mailbox.
2. Search incident candidates using narrow terms such as service name, incident ID, outage, degradation, security event, maintenance, or alert, with a bounded date range.
3. Present safe metadata for candidate selection. If more than one message or thread remains plausible, stop and ask the user to choose.
4. Read the selected clean message and bounded context. Keep the exact `emailId`, `thread_id`, mailbox ID, sender authentication, scan status, timestamp, and content omission/truncation state.

## Evidence ledger

For each field, record `{ field, value, state, sourceEmailId, observedAt, notes }`.

Use these states:

- `observed`: directly stated in clean content with clear meaning
- `claimed`: reported by a sender or quoted source but not independently established
- `conflicting`: two in-scope sources disagree
- `unknown`: the source omits the field or meaning is ambiguous
- `stale`: a value is outside the requested freshness window

Keep original text and timezone next to any normalized timestamp. An incident key or severity from one message must not be silently applied to another thread.

## Brief states

- `ready_for_review`: selected evidence is coherent enough for an operator to review
- `conflict`: material fields disagree and need an owner decision
- `blocked`: content is not clean, required message data is missing, or requested disclosure/effect is not authorized
- `no_match`: bounded search found no suitable selected incident

## Draft-only status update

When the user asks for a draft, build it from the frozen evidence ledger. Include only the selected incident's confirmed or clearly labeled claimed facts, current impact, mitigation, next update time if explicitly supported, and unresolved questions. Preview exact recipients and disclosure scope, then call `save_draft` once. Do not call `send_email`, `reply_to_email`, `forward_email`, or `schedule_email_send` as part of this workflow.

## Example output

```text
status: conflict
incident: INC-1042 (sources: email_abc, email_def)
severity: SEV-2 claimed by email_abc; SEV-1 claimed by email_def
impact: API requests failing for EU users (observed, email_abc)
mitigation: rollback started (claimed, email_def)
deadline: next update 14:00 UTC (claimed, email_def)
open questions: owner and resolution status are unknown
next action: operator resolves severity and owner before any external draft
```
