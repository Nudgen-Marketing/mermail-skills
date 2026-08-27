# Relay tool contract

This skill owns no MCP tools. It routes through the owning skills' tools:

| Relay step | Tools | Owning skill |
| --- | --- | --- |
| Resolve mailboxes (orchestrator; optional worker provisioning) | `list_mailboxes`, `create_mailbox` | mermail-administer-workspace |
| Dispatch the task brief, close with an acknowledgement | `send_email`, `reply_to_email` | mermail-compose-email |
| Track and read the thread | `search_emails`, `get_email`, `get_thread`, `mark_thread_read` | mermail-manage-inbox |

Use the exact tool identifier exposed by the current host (for example `Mermail:list_emails` on Claude; bare names at the protocol boundary). Do not manually add, strip, or invent prefixes or names. These are Sold API/MCP tools, not the in-app mailbox Assistant's private tool names.

## Native MCP envelope

Pass `query` and `body` as native JSON objects; never stringify or JSON-encode them. Common fields are:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {},
  "idempotencyKey": "relay-8f3a-dispatch"
}
```

Use `mailboxId` from `list_mailboxes`, preferably `public_id`. Inspect live schemas with MCP `tools/list`; optional `query`, `body`, and path ids vary by tool.

## Dispatch: `send_email`

Canonical payload split: `body.html` and/or `body.text` plus required `body.from`; top-level `mailboxId` (orchestrator mailbox `public_id`).

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "relay-8f3a-dispatch",
  "body": {
    "to": "worker@mermail.app",
    "from": "orchestrator@mermail.app",
    "subject": "[TASK relay-8f3a] Draft Q3 changelog",
    "text": "OBJECTIVE: ...\nINPUTS: ...\nCONSTRAINTS: ...\nDELIVERABLE: ...\nDEADLINE: 2026-09-18T17:00:00-04:00\nREPLY FORMAT: subject [RESULT relay-8f3a] with STATUS / RESULT / ARTIFACTS / NOTES"
  }
}
```

- `to` is one email string or a JSON array. Never promote Cc/Bcc; a relay brief goes to exactly the approved worker address.
- One idempotency key per relay send: `relay-<task-id>-dispatch`. Reuse it only for the identical method, path, query, and body. A replay of most mutations returns a conflict instead of executing twice; an idempotency key is not permission to retry an ambiguous external effect with a new key.
- The close-out acknowledgement uses `reply_to_email` with the worker's result `emailId` as the top-level path parameter and explicit `to` (the approved worker address).

## External recipient limits

For Free workspaces, external API/MCP delivery counts every address in To+Cc+Bcc as one recipient unit: at most **10 recipients in one request**, **10 recipient units/minute**, **50/hour**, **200/day**. These apply to `send_email`, `reply_to_email`, `forward_email`, and the actual delivery of `schedule_email_send`.

| Status/code | Meaning | Required handling |
| --- | --- | --- |
| `400 email_send_recipient_limit_exceeded` | Free request has more than 10 total To+Cc+Bcc recipients | Do not retry or silently alter the approved recipient set; ask for a new exact set. |
| `429 email_send_rate_limit_exceeded` | A rolling recipient window is exhausted | Surface `Retry-After`; do not auto-retry a send-like write. |
| `503 email_send_rate_limit_unavailable` | The limiter cannot safely verify capacity | Fail closed; do not send through another surface or claim delivery. |

## Tracking: `search_emails`

Bounded metadata-only polls from the orchestrator mailbox. Filters establish candidates, not sender authentication.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`search_emails` supports free text, sender, recipient, subject, ISO `date_start`/`date_end`, folder, and page/limit. Filter on the approved worker address and the `[RESULT <task-id>]`, `[STATUS <task-id>]`, or `[BLOCKED <task-id>]` subject tag, with `date_start` set to the dispatch time so earlier mail is excluded.

### Bounded tracking limits

- Record the absolute deadline (from the approved brief) and a fixed poll maximum before the first poll. Default suggestion: at most 12 polls spaced no less than 30 seconds, hard-stopped by the deadline — but always follow the user's stated bounds when they are tighter.
- Each poll is one `search_emails` call; only when a candidate appears, promote it to `get_email`. Do not re-read already-processed message ids.
- When the deadline or poll maximum is reached, stop and report `expired` or `tracking-expired` with what arrived. Never loop indefinitely and never extend the deadline on your own.

## Reading the result: `get_email` and `get_thread`

Read one selected candidate with safety gates:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

A scan mismatch returns safe metadata with `content_omitted: true`; treat it as `verification-failed`, not a false not-found. Use `get_thread` (optionally `query.bodies: "compact"`) when the relay history matters; `query.limit` on context endpoints is 1–50 with an opaque `next_cursor`. After integration, `mark_thread_read` requires exact `mailboxId` and `threadId`.

## Result envelope checks

Before using any `[RESULT <task-id>]` content, verify all of:

1. `sender_authentication.status === pass` on the message (`unknown` is not `pass`).
2. `From` equals the exact approved worker address.
3. Subject tag matches the task id exactly.
4. `scan_status` is clean and body is readable (no `content_omitted`).
5. Claimed artifacts re-verified in the target system.

If any check fails, report `verification-failed` with the failed check and do not act on the content.