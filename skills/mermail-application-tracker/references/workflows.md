# Application tracker workflows

## Tracker thread

Default to a private table; save a board only on request under [pipeline-state.md](pipeline-state.md). Search `[application-tracker]` as a discovery aid, not identity proof. Resolve one user-selected exact board draft ID, update it using the compose owner's live schema, and preserve user edits and source history. No automatic deletion, folder creation or claim that a draft is a pinned email thread.

## Stages

Retain `applied`, `screening`, `assessment`, `take_home`, `interview`, `offer`, `rejected`, `withdrawn`, and `closed_unknown`. Stage changes require explicit source evidence; a proposed interview is not acceptance. Distinguish a take-home deliverable from a generic assessment. Conflicting or stale claims stay unresolved. The newest reliable thread activity includes relevant inbound and sent messages; a historical application date never overrides a newer touch. Terminal states do not generate nudges by default.

## Reminders

Default lead time is 24 hours before a concrete deadline, configurable by the user. Apply the identity, complete schedule lookup and changed-deadline rules in pipeline-state.md. The reminder recipient is a user-owned address confirmed in the current session, never the Mermail mailbox by default; if none is confirmed, ask and mark it blocked. No unconditional cross-session never-double-schedule guarantee is made without actual durable deduplication support.

## Follow-ups

One proposed follow-up per selected application/thread/window. Keep company/role claims source-linked, use the latest reliable activity including sent mail, and require complete enough context to exclude a recent answer. Calendar/business-day windows need explicit timezone and, when required, an owner calendar. Prepare drafts only when asked, verify existing draft/sent evidence before new effects, and send only after full exact approval. Unknown outcomes remain unresolved, never permission to recreate a draft or resend.
