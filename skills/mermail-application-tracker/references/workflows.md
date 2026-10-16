# Application tracker workflows

## Tracker thread

The pipeline lives in one mailbox thread whose subject carries the marker `[application-tracker]`. On each run: search for that subject, read the latest summary, apply changes from new mail, and save the updated summary with `save_draft`. Create the thread only when none exists.

## Stages

`applied` -> `assessment` -> `interview` -> `offer` | `rejected` | `withdrawn`. A thread advances only on inbound evidence. No inbound activity after `applied` within the follow-up window keeps the stage at `applied` and flags the application for a follow-up draft. Activity evidence includes an application date stated in the mail body; when it predates the mail's own arrival date, use the stated date for follow-up timing.

## Reminders

Default lead time is 24 hours before a concrete deadline. Before scheduling, search scheduled sends for an existing reminder for the same thread and deadline. Never double-schedule. The reminder recipient is a user-owned address confirmed in the current session, never the Mermail mailbox by default; if none is confirmed, ask the user and mark the reminder `blocked` until answered.

## Follow-ups

One follow-up per thread per follow-up window. Draft body references the real company, role, and the date of the last inbound mail. Send only after the user approves the exact preview.
