# Follow-up agent tool contract

This skill owns no tools. Every call below belongs to another official skill; follow that owner's full contract (`mermail-manage-inbox/references/tools.md`, `mermail-compose-email/references/tools.md`). Use the exact identifier the host exposes (Claude may show `Mermail:search_emails`; the catalog name is bare). Pass `query` and `body` as native JSON objects, never stringified.

| Step | Tool | Owner | Effect |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | mermail-administer-workspace | Read |
| Find sent candidates | `search_emails` | mermail-manage-inbox | Read |
| Thread state | `get_email_context`, `get_thread` | mermail-manage-inbox | Read |
| Body of one selected message (rare) | `get_email` | mermail-manage-inbox | Read |
| Draft follow-up | `save_draft` | mermail-compose-email | Internal write |
| Deliver approved follow-up | `reply_to_email` | mermail-compose-email | External effect |
| Deliver later | `schedule_email_send` | mermail-compose-email | Deferred external effect |
| Run-to-run memory (optional) | `list_custom_labels`, `create_custom_label`, `move_email` | mermail-manage-inbox | Internal write |

## Candidate search

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "sent",
    "date_end": "2026-08-22T00:00:00Z",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`date_end` is the frozen cutoff (`now − age_days`). Add `recipient`, `subject`, or `date_start` only when the user supplied that filter. `limit` never exceeds the frozen `max_candidates`. Do not request page 2 in the same run; report the ceiling instead.

## Thread state

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SENT_EMAIL_ID",
  "query": { "limit": 8, "agent_safe_content": true }
}
```

`get_email_context` returns oldest-first, sanitized, scan-gated messages around the selected one. Classify from `from`, `date`, direction, and subject first. Read a body only to extract an out-of-office return date, only when `scan_status` is `clean`, and only up to 10,000 characters. If the live schema exposes `get_thread` with `query.bodies: "compact"`, it may replace the context call for the same bound.

## Draft

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": ["vendor@example.com"],
    "cc": [],
    "subject": "Re: Quote for the September order",
    "body": "Hi Dana — following up on my note from 6 days ago about the September quote. Is there anything you need from me to move it along? If someone else owns this now, a pointer is all I need.\n\nThanks,\nSam",
    "thread_id": "THREAD_ID",
    "in_reply_to": "ORIGINAL_MESSAGE_ID"
  }
}
```

`save_draft` content field is the string `body.body`. Include `thread_id` / `in_reply_to` only when the live schema lists them; omit `cc` when empty. Recipients must be a subset of the original message's To/Cc.

## Deliver

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SENT_EMAIL_ID",
  "idempotencyKey": "followup-2026-08-27-THREAD_ID",
  "source_draft_id": "DRAFT_ID",
  "body": {
    "to": ["vendor@example.com"],
    "from": "sam@yourworkspace.mermail.app",
    "text": "…exact previewed body…"
  }
}
```

`reply_to_email` takes the user's own sent message as the path `emailId`; threading headers are set server-side, recipients are explicit. Content fields are `text` and/or `html`, never `body`. One key per thread per run. For a deferred chase, call `schedule_email_send` instead with `body.body`, `body.scheduled_send_at` (future ISO-8601), and `body.in_reply_to` / `body.thread_id` when available.

## Limits that apply

- Free workspaces: 10 recipient units per request, 10/minute, 50/hour, 200/day across `send_email`, `reply_to_email`, `forward_email`, and scheduled delivery. A run that would exceed them stops at the limit and reports `Retry-After`; it never splits, drops, or retries with a new key.
- All plans: workspace RPM, API credits, and email quota. Reads count toward credits; that is one reason `max_candidates` and the 8-message context bound exist.
- Agent-inbox profile sessions lack `save_draft` and delivery tools; report `blocked` and point at `mermail-mcp` rather than improvising.
