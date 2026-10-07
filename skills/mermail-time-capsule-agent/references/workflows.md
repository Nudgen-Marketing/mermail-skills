# Time Capsule workflows

## Compose and schedule a capsule

1. Classify the intent. Route immediate sends and ordinary drafting to `mermail-compose-email`; this workflow is only for future-dated capsules, inspection, and cancellation.
2. Resolve the sending mailbox with `list_mailboxes` when `mailboxId` is unknown. Prefer `public_id`; use the mailbox email as `from` and as the recipient for future-self capsules.
3. Resolve the delivery moment. Interpret relative language ("in three months", "next New Year") in the workspace timezone when known; otherwise ask. Convert the approved moment to a future absolute ISO-8601 `scheduled_send_at`. Ask rather than guessing across a daylight-saving transition.
4. Classify the capsule type: future-self letter, future reminder, or delayed message to someone else. Delayed messages to other recipients require the user to state recipient and reveal time explicitly before the preview.
5. Draft the content with `save_draft` (string `body.body`) while writing or revising. Reuse `draft_id` when replacing the same capsule draft; do not create parallel drafts.
6. Present the exact preview: from, To, Cc, Bcc, total To+Cc+Bcc recipient units, subject, body summary or exact body, the absolute delivery moment as weekday, date, local time, timezone, and ISO-8601 timestamp, and whether the capsule is addressed to the user's own mailbox.
7. Obtain external-effect approval immediately before `schedule_email_send` unless the same user message already unambiguously approves that exact payload. Generate one idempotency key and execute the approved schedule once.
8. Verify the authoritative response: `status: scheduled`, `scheduled_send_at`, and schedule or draft identifiers. Restate the delivery moment and identifiers to the user. A draft save alone is not a schedule.
9. If scheduling fails, keep the capsule unscheduled and report the error. Never fall back to `send_email` or `reply_to_email`, and never retry an ambiguous result with a new key.

## Inspect scheduled capsules

1. Search the mailbox for scheduled drafts with `search_emails` (bounded `page`/`limit`, native JSON `query`).
2. Read each identified capsule with `get_email` using safety filters (`require_scan_status: "clean"`, `agent_safe_content: true`, bounded `max_body_chars`).
3. Report subject, recipients, and delivery time per capsule. When nothing is scheduled, say so explicitly.

## Cancel a scheduled capsule

1. Identify the exact scheduled draft and present it (subject, recipients, delivery time).
2. Obtain explicit user confirmation for cancelling that capsule.
3. Obtain a short-lived, single-use confirmation token via `prepare_destructive_action` bound to the exact tool and arguments.
4. Call `delete_email` once. A scheduled draft is cancelled in place, not moved to Trash. Report `cancelled`; never claim the capsule was still delivered.

## Recurring requests

Recurring capsules are unsupported: there is no recurring schedule tool on external MCP. Report the limitation and offer a single scheduled capsule instead. Do not pre-schedule a series and do not promise automatic rescheduling.

## Deferred delivery

Rolling recipient quota is consumed at actual delivery. If a capsule is deferred by `email_send_rate_limit_exceeded`, Mermail restores it to `scheduled` with a retry time. Report `deferred`, not `sent`; do not create another schedule; surface `Retry-After`.
