# Tool contract

This skill owns no tools. It composes tools owned by other official skills. Use the exact identifier the host exposes (for example `Mermail:search_emails` or bare `search_emails`); never add or strip a prefix yourself. Pass `query` and `body` as native JSON objects, never stringified JSON.

## Tools used

| Step | Tool | Owner | Effect |
| --- | --- | --- | --- |
| Pick mailbox | `list_mailboxes` | `mermail-administer-workspace` | Read |
| Find candidates | `search_emails` | `mermail-manage-inbox` | Read |
| Read one email | `get_email` | `mermail-manage-inbox` | Read |
| Save digest or rationale | `save_draft` | `mermail-compose-email` | Internal write, never sent |
| Reminder | `schedule_email_send` | `mermail-compose-email` | Deferred external effect |

No other tool is needed. Do not call wallet, PayBox, send, reply, forward, delete, or move tools from this skill.

## Candidate search

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "sender": "notify@snapshot.org",
    "folder": "inbox",
    "date_start": "ISO_DATE_30_DAYS_AGO",
    "page": 1,
    "limit": 25,
    "metadata_only": true
  }
}
```

Use `public_id` from `list_mailboxes` as `mailboxId`. Inspect live schemas with `tools/list` if a field is rejected. The sender filter selects candidates only; it is not sender authentication.

## Read one selected email

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

A scan mismatch returns safe metadata with `content_omitted: true`. Keep the row, mark it `content unavailable`, and do not retry with weaker filters.

## Draft (never sent)

Drafts use the string field `body.body`. The recipient is required and must be one the user named in this request. `my own Mermail address` resolves to the selected mailbox address from `list_mailboxes`.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "USER_NAMED_RECIPIENT",
    "subject": "Rex DAO Brief: YYYY-MM-DD",
    "body": "Plain-text brief"
  }
}
```

## Reminder

`schedule_email_send` is a deferred external effect. Show the exact recipient, send time, subject, and body, get fresh approval, then call it once with a stable `idempotencyKey`. The send time must be before the stated end time. If the call fails or times out, report that status is unknown; never schedule a second one.
