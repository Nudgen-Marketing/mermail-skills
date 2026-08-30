# Time Capsule tools

This persona uses tools owned by focused skills and does not claim any of them in `tool-coverage.json`:

- `mermail-administer-workspace` owns `list_mailboxes` and `get_mailbox`.
- `mermail-compose-email` owns `save_draft` and `schedule_email_send`.
- `mermail-manage-inbox` owns `search_emails`, `get_email`, and `delete_email`.

Use the exact tool identifier exposed by the current host, including host-qualified forms such as `Mermail:schedule_email_send` or `Mermail:list_emails` when the host qualifies names. Never manually add, strip, or invent the qualifier.

## Mailbox discovery

`list_mailboxes` resolves the sending mailbox. Prefer the stable `public_id` as `mailboxId`; the mailbox email is used as `from`. A future-self capsule is addressed to the mailbox's own email.

## Draft and schedule

Pass Sold API fields under the tool's `body` argument; path parameters like `mailboxId` stay top-level. Pass `query` and `body` as native JSON objects — never stringified JSON blobs.

`save_draft` and `schedule_email_send` use the string content field **`body`** (HTML or text), not `html`/`text`:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "me@mermail.app",
    "subject": "A letter from your past self",
    "body": "<p>Dear future me, ...</p>"
  }
}
```

`schedule_email_send` additionally requires `scheduled_send_at` on `body` as a future absolute ISO-8601 datetime:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "capsule-2026-08-30-newyear-a1",
  "body": {
    "to": "me@mermail.app",
    "subject": "Open on January 1st",
    "body": "<p>Dear future me, ...</p>",
    "scheduled_send_at": "2027-01-01T09:00:00+05:30"
  }
}
```

- Recipients for draft and schedule accept one email string, a comma-separated string, or a JSON array.
- Schedule requires at least one To recipient at execution time.
- Reuse `draft_id` only when replacing an existing regular draft; do not create parallel drafts for the same capsule.
- Pass `idempotencyKey` at the top level when using one. Reuse it only for the identical method, path, query, and body. Never replay an ambiguous external effect with a new key.
- Verify the returned `status: scheduled`, `scheduled_send_at`, and schedule or draft identifiers. A saved draft response alone is not a scheduled capsule.

## Inspecting scheduled capsules

Scheduled mail exists as a scheduled draft until delivery. `search_emails` supports free text, subject, recipient, ISO `date_start`/`date_end`, folder, read/starred state, and safety fields; filters establish candidates, not sender authentication. Pass `query` as a native JSON object and keep `page`/`limit` bounded. Read one identified capsule with `get_email` using safety filters such as `require_scan_status: "clean"`, `agent_safe_content: true`, and a bounded `max_body_chars` (for example 10000). Keep reads bounded: metadata first, exact reads only for identified capsules, no unbounded loops.

## Cancelling a scheduled capsule

Cancellation is the destructive `delete_email` owned by `mermail-manage-inbox`:

1. Identify the exact scheduled draft and present it to the user.
2. Obtain explicit user confirmation for that capsule.
3. Obtain a short-lived, single-use confirmation token via `prepare_destructive_action` bound to the exact tool and arguments.
4. Call `delete_email` exactly once. A scheduled draft is cancelled in place, not moved to Trash.

Never use `empty_trash`, `bulk_delete_emails`, or ordinary mail deletion as a substitute for cancelling one identified capsule.

## Limits and errors

External recipient limits apply to the actual delivery of a scheduled capsule. On a known Free workspace, delivery counts every To+Cc+Bcc address as one recipient unit: at most 10 per request, 10 recipient units/minute, 50/hour, 200/day. Scheduling validates the per-request recipient count, but rolling quota is consumed at delivery; a deferred capsule remains `scheduled`.

| Status/code | Meaning | Required handling |
| --- | --- | --- |
| `400 email_send_recipient_limit_exceeded` | Free request has more than 10 total To+Cc+Bcc recipients | Do not retry or alter the approved recipient set; ask for a new exact set. |
| `429 email_send_rate_limit_exceeded` | Rolling recipient window exhausted at delivery | Surface `Retry-After`; report the capsule as `deferred`, not `sent`; do not create another schedule. |
| `503 email_send_rate_limit_unavailable` | Limiter cannot safely verify capacity | Fail closed; do not schedule through another surface or claim delivery. |
| `code: "validation_failed"` | Payload rejected | Read the `details` array for the named fields; fix exactly those fields. |

Mermail consumes rolling quota at actual delivery, not when the schedule is created. Never promise that present capacity guarantees future delivery capacity.
