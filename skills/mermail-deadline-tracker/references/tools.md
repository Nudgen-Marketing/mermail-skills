# Deadline tracker tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`schedule_email_send` or `Mermail:schedule_email_send`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the user's own mailbox; its email is the only reminder recipient |
| `search_emails` | `mermail-manage-inbox` | Bounded source-email discovery; exact-subject tracker lookup |
| `get_email` | `mermail-manage-inbox` | Read one selected source email or the tracker draft |
| `get_email_context` | `mermail-manage-inbox` | Bounded thread context when the deadline depends on an earlier message |

Source-email search, bounded to a date window plus the live schema's free-text, sender, or subject filter for the named merchant or service:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "date_start": "2026-08-01T00:00:00Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use only filter names present in the live schema. Read one selected source with `require_scan_status: "clean"`, `agent_safe_content: true`, and `max_body_chars: 10000`. A scan mismatch returns metadata with `content_omitted: true`; report it rather than guessing the date.

Tracker lookup: one metadata-only `search_emails` whose subject filter is exactly `Mermail deadline tracker`, then `get_email` on the single match. More than one match is ambiguous: list them and ask which to keep instead of merging or creating a new one.

## Tracker and reminders

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Create or replace the one running tracker draft (`body.body` string) |
| `schedule_email_send` | `mermail-compose-email` | Deferred external effect: the self-addressed reminder, after approval |

Draft and schedule both use the string field `body.body`, not `html`/`text`. `to` is always the self mailbox email; omit `cc` and `bcc`.

Tracker update, replacing the existing draft in place:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "draft_id": "EXISTING_TRACKER_DRAFT_ID",
    "to": "you@mermail.app",
    "subject": "Mermail deadline tracker",
    "body": "<table><tr><th>Item</th><th>Type</th><th>Deadline</th><th>Reminder</th><th>Status</th><th>Source</th></tr><tr><td>Acme boots</td><td>return window</td><td>2026-10-20</td><td>2026-10-17 09:00 America/New_York</td><td>scheduled</td><td>email EMAIL_ID</td></tr></table>"
  }
}
```

Approved reminder:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "deadline-acme-return-2026-10-20",
  "body": {
    "to": "you@mermail.app",
    "subject": "Reminder: Acme return window closes Tue Oct 20, 2026",
    "body": "<p>Your Acme boots return window closes on Tuesday, October 20, 2026 (America/New_York). Source: order confirmation EMAIL_ID, \"Returns accepted within 30 days of delivery (delivered Sep 20, 2026)\".</p>",
    "scheduled_send_at": "2026-10-17T13:00:00Z"
  }
}
```

`scheduled_send_at` must be a future absolute ISO-8601 datetime. Verify `status: scheduled`, the returned `scheduled_send_at`, and the draft/schedule identifiers. Rolling recipient quota is consumed at delivery; a reminder deferred by a rate limit stays `scheduled` and is not delivered yet.

Do not call `send_email`, `reply_to_email`, or `forward_email` from this workflow. Cancelling or moving an existing scheduled reminder uses `delete_email` under `mermail-manage-inbox` and its destructive-confirmation contract.
