# Tools used by the heartbeat cycle

This skill owns no tools. Every call below belongs to an owning skill whose full contract governs; this file records only what the heartbeat cycle needs, with argument shapes verified against the live hosted MCP server (API-key mode, full profile).

Use the exact tool identifier exposed by the current host (a host may qualify names, e.g. `Mermail:search_emails`; the catalog name is bare). Pass `query` and `body` as native JSON objects, never stringified.

| Cycle step | Tool | Owning skill | Effect class |
| --- | --- | --- | --- |
| Mailbox discovery | `list_mailboxes` | workspace discovery | read |
| Catch-up digest | `search_emails`, `list_emails`, `get_email` | `mermail-manage-inbox` | read |
| Owner briefing | `send_email` | `mermail-compose-email` | external effect |
| Arm overdue alert | `schedule_email_send` | `mermail-compose-email` | deferred external effect |
| Cancel armed alert | `prepare_destructive_action` + `delete_email` | `mermail-manage-inbox` | destructive (cancel-in-place) |

## Mailbox discovery

`list_mailboxes` returns each mailbox's `email`, `public_id`, and `receiving_status`. Prefer `public_id` as `mailboxId` everywhere. Require `receiving_status: "ready"` before relying on the mailbox for the cycle.

## Catch-up reads

`search_emails` bounded to the sleep window:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": { "date_start": "2026-08-31T04:00:00Z", "limit": 20 }
}
```

`date_start` / `date_end` are ISO-8601. Results include `is_urgent`, `category`, `read`, `scan_status`, and `sender_authentication` — classify from these; filters establish candidates, not sender authentication. `list_emails` with `query.folder: "scheduled"` is the authoritative view of currently armed scheduled sends; `folder: "sent"` verifies an uncertain briefing send.

## Briefing send

`send_email` content fields are `html` and/or `text` (not `body`); `body.from` is required:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "heartbeat-briefing-<wake-id>",
  "body": {
    "to": "owner@example.com",
    "from": "agent@mermail.app",
    "subject": "[agent] Wake briefing 2026-08-31T04:30Z",
    "text": "..."
  }
}
```

Verified response shape: `{ "id": "...", "status": "queued", "undo_until": "<ISO datetime>" }`. `queued` is acceptance, not delivery. Delivery to external recipients is subject to plan recipient limits; on the stable limiter error, surface it and the `Retry-After` — do not resend with altered recipients.

## Arming the alert

`schedule_email_send` uses the string content field `body.body` (not `html`/`text`) plus `scheduled_send_at`, a future ISO-8601 UTC datetime, on `body`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "owner@example.com",
    "subject": "[agent] OVERDUE: no wake since 2026-08-31T04:30Z",
    "body": "The agent missed its expected wake. Last wake: ... Check first: ...",
    "scheduled_send_at": "2026-09-01T06:00:00Z"
  }
}
```

Verified response shape: `{ "id": "...", "draft_id": "...", "status": "scheduled", "scheduled_send_at": "..." }`. Record `draft_id` in agent state — the next wake's cancel targets it. To reuse the previous cycle's cancelled message from Drafts, pass its id as `draft_id` when scheduling. Rolling recipient quota is consumed at delivery, not at scheduling; a deferred message remains `scheduled`.

## Cancelling the alert (verified cancel-in-place)

Cancellation is `mermail-manage-inbox`'s delete contract applied to the scheduled draft. Two calls:

1. `prepare_destructive_action` — arguments are `action` (the final tool name) and `arguments` (the exact final arguments):

```json
{
  "action": "delete_email",
  "arguments": { "mailboxId": "MAILBOX_PUBLIC_ID", "emailId": "ARMED_ALERT_DRAFT_ID" }
}
```

Returns `{ "confirmationToken": "...", "expiresInSeconds": 300 }`. The token is single-use and bound to those exact arguments.

2. `delete_email` with the same `mailboxId` and `emailId` plus `confirmationToken`. Success is `{ "ok": true, "status": 204 }`.

Verified semantics: with `permanent` absent or false, a scheduled draft is **cancelled in place** — it leaves the `scheduled` folder and returns to Drafts intact (verify: gone from `folder: "scheduled"`, present in `folder: "draft"`). It is not trashed and not hard-deleted. Never pass `permanent: true` in this workflow; that hard-deletes and forfeits draft reuse.

## Credits and limits

Every call consumes API credits under the workspace plan; the cycle is small (typically ≤ 6 calls) but runs on every wake, so keep the catch-up read to one bounded search. All calls remain subject to workspace RPM limits. API-key mode is sufficient for this entire cycle; no wallet or OAuth-only tool is involved.
