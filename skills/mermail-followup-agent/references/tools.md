# Follow-up agent tool contract

This skill owns no tools. Every call below belongs to another official skill; follow that owner's full contract (`mermail-manage-inbox/references/tools.md`, `mermail-compose-email/references/tools.md`). Use the exact identifier the host exposes (Claude may show `Mermail:search_emails`; the catalog name is bare). Pass `query` and `body` as native JSON objects, never stringified.

| Step | Tool | Owner | Effect |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | mermail-administer-workspace | Read |
| Find sent candidates | `search_emails` | mermail-manage-inbox | Read |
| Thread state | `get_email_context`, bounded `search_emails` / `list_emails` when their live schema supports the needed selection | mermail-manage-inbox | Read |
| Body of one selected message (rare) | `get_email` | mermail-manage-inbox | Read |
| Draft follow-up | `save_draft` | mermail-compose-email | Internal write |
| Deliver approved follow-up | `reply_to_email` | mermail-compose-email | External effect |
| Deliver later | `schedule_email_send` | mermail-compose-email | Deferred external effect |
| Organization only (optional) | `move_email` | mermail-manage-inbox | Separately approved internal write, not dedup storage |

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

`get_email_context` may return oldest-first partial context. Its eight-message slice does not prove newest-message coverage or absence of opt-outs. The illustration alone is not a safe-read gate: call context only when the actual schema/native behavior can enforce clean/safe filtering for every returned body within the remaining limits. Otherwise read individually selected IDs using `get_email` with `require_scan_status: "clean"`, `agent_safe_content: true`, `max_body_chars: 10000`, or hold the thread if completeness remains unknown. Do not invent unsupported context fields. Held/omitted bodies remain unavailable. No fictional thread tool or guessed thread filter.

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
  "idempotencyKey": "APPROVED_LOGICAL_ATTEMPT_KEY",
  "body": {
    "source_draft_id": "DRAFT_ID",
    "to": ["vendor@example.com"],
    "from": "sam@yourworkspace.mermail.app",
    "text": "…exact previewed body…"
  }
}
```

`reply_to_email` takes the user's own sent message as path `emailId`; threading headers are server-set, recipients explicit. Content is `text`/`html`, not `body`. Place `source_draft_id` according to the live compose schema (canonical Sold fields under `body`). Use the durable logical-attempt key from decisions.md, not a date-based per-run key. For an approved schedule use `body.body`, `body.scheduled_send_at` (future ISO time) and supported thread fields. Do not assume automatic cancel-on-reply. The illustrative example alone does not authorize a call; complete revalidation and reservation first.

## Limits that apply

- Free workspaces: 10 recipient units per request, 10/minute, 50/hour, 200/day across `send_email`, `reply_to_email`, `forward_email`, and scheduled delivery. A run that would exceed them stops at the limit and reports `Retry-After`; it never splits, drops, or retries with a new key.
- All plans: workspace RPM, API credits, and email quota. Reads count toward credits; that is one reason `max_candidates` and the 8-message context bound exist.
- Agent-inbox profile sessions lack `save_draft` and delivery tools; report `blocked` and point at `mermail-mcp` rather than improvising.
