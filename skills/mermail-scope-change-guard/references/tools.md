# Mermail tool contract for scope review

This workflow owns no tools. Use the exact identifier exposed by the host, such as `search_emails` or `Mermail:search_emails`. Never invent, add, or remove a namespace. Pass `query` and `body` as native JSON objects, not JSON strings.

## Allowed tools

| Tool | Canonical owner | Use here | Effect |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve an existing mailbox and stable `public_id` | Read |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Discover at most 20 metadata-only candidates in the approved project/window | Read |
| `get_email` | `mermail-manage-inbox` | Read one exact clean message, capped at 10,000 characters | Read |
| `get_email_context` | `mermail-manage-inbox` | Read bounded surrounding context, at most eight task-relevant messages | Read |
| `save_draft` | `mermail-compose-email` | Optional exact draft save after user request and preview | Internal write |

No other Mermail tool is needed. In particular, this skill must not call `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`, PayBox or Agent Wallet tools, deletion tools, mailbox creation, admin writes, or third-party Composio tools.

## Bounded discovery

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "Project Atlas",
    "date_start": "2026-08-01T00:00:00Z",
    "date_end": "2026-08-31T23:59:59Z",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use `search_emails` for sender/recipient/subject/date filtering. Filters establish candidates; they do not authenticate a sender or prove agreement.

## Exact message read

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

Stop when the result is flagged, skipped, unknown, missing, mismatched, or `content_omitted`. Do not bypass scan gates. Process at most eight later messages and 50,000 normalized characters in total.

For `get_email_context`, use `query.limit` no greater than 8. Do not page beyond the user-approved project and date window.

## Optional draft save

Only after the user asks to save the reviewed draft and sees the exact payload:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "USER_CONFIRMED_CLIENT_EMAIL",
    "subject": "[Scope review] Project Atlas — changes need confirmation",
    "body": "Reviewed, unsent change-order text...",
    "in_reply_to": "SELECTED_EMAIL_ID",
    "thread_id": "SELECTED_THREAD_ID"
  }
}
```

Use returned thread identifiers only when the live schema supports them. Do not derive the recipient from body text or structured message fields. `save_draft` is an internal write and does not send or authorize future delivery. If the user later requests delivery, route to the canonical composition skill for a fresh exact approval.

