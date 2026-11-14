# Scholarship desk tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `track_application`, `submit_application`, `pay_fee`, or `accept_offer` tools. Map those intents to the real operations below or hand the step to the user.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact tool identifier the host exposes (`search_emails`, or a host-qualified form such as `Mermail:search_emails`); do not add, strip, or invent a prefix. Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find the application mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find application mail | `search_emails` or `list_emails` (metadata first) | `mermail-manage-inbox` |
| Read one message safely | `get_email` with `require_scan_status: "clean"`, `agent_safe_content: true`, `max_body_chars` | `mermail-manage-inbox` |
| Read surrounding thread | `get_email_context` (bounded, opaque `next_cursor`) | `mermail-manage-inbox` |
| Mark urgent | `update_email` with `body.starred: true` | `mermail-manage-inbox` |
| File processed mail | `list_folders`, then `move_email` | `mermail-manage-inbox` |
| Draft a reply or reminder | `save_draft` (string `body.body`) | `mermail-compose-email` |
| Send an approved reply | `reply_to_email` (`body.from` + `body.text`, explicit `to`) | `mermail-compose-email` |
| Submit a portal, pay a fee, accept an offer | Not a Mermail tool. Hand to the user. | none |

## Discovery

Default: one bounded metadata-only list of the newest inbox mail, then classify locally.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Targeted: one `search_emails` call with a single keyword in the free-text field `query.query` (for example `scholarship` or `interview`), plus optional `from`, `subject`, `date_start`, `date_end`, and safety fields:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "scholarship",
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean"
  }
}
```

Do not assume boolean `OR` syntax. There is no `sort: "date_desc"` shortcut. Search filters return candidates, not sender authentication.

## Safe read

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

A scan mismatch returns safe metadata with `content_omitted: true`. Keep that message metadata-only and put it in `unclear`.

## Draft

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "admissions@example.edu",
    "subject": "Re: Interview invitation - MSc Data Science",
    "body": "Dear Admissions Committee, ...",
    "in_reply_to": "SOURCE_MESSAGE_ID_WHEN_RETURNED",
    "thread_id": "SOURCE_THREAD_ID_WHEN_RETURNED"
  }
}
```

Drafts use the string field `body.body`. Do not use `html`/`text` for drafts. Pass `in_reply_to` and `thread_id` only when the selected source message returned them. When replacing an earlier draft, pass `draft_id`; do not create a second draft for the same reply.

## Approved reply

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "idempotencyKey": "scholarship-reply-EMAIL_ID-1",
  "body": {
    "to": "admissions@example.edu",
    "from": "applicant@mermail.app",
    "subject": "Re: Interview invitation - MSc Data Science",
    "text": "Dear Admissions Committee, ..."
  }
}
```

The reply API requires `to`, `from`, and `subject`, plus `html` and/or `text`. MCP does not auto-fill Reply All. Pass explicit `to`; pass `cc` only when the user approved it. When sending an existing draft, pass `source_draft_id`.

## Plan and rate limits

- Free workspaces have low API RPM and a monthly API-credit allowance; keep one run to one discovery call plus bounded reads.
- Free external delivery allows at most 10 recipients per request and rolling recipient windows (10/minute, 50/hour, 200/day). See `mermail-compose-email` for the exact error codes.
- On `429`, surface `Retry-After` and stop. Never retry a send-like write automatically or with a new idempotency key.
