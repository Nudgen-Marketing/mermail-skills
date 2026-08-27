# Language Bridge tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill as a business-tool domain in `tool-coverage.json`.

Use the exact identifier exposed by the host, such as `search_emails` or `Mermail:search_emails`. Pass `query` and `body` as native JSON objects, never stringified JSON. Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real tool | Owner |
| --- | --- | --- |
| Resolve a mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find source metadata | `search_emails` or `list_emails` | `mermail-manage-inbox` |
| Read one selected source | `get_email` | `mermail-manage-inbox` |
| Read bounded surrounding context | `get_email_context` | `mermail-manage-inbox` |
| Read an exact thread | `get_thread` | `mermail-manage-inbox` |
| Save an unsent translated reply | `save_draft` | `mermail-compose-email` |
| Deliver after exact approval | `reply_to_email` | `mermail-compose-email` |

This skill has no separate translation tool. Translation happens in the agent after safe, bounded Mermail reads. Do not invent `translate_email`, `detect_language`, `reply_all`, or `send_translation` tools.

## Safe source selection

Start with metadata only:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "sender": "sender@example.com",
    "subject": "optional exact subject fragment",
    "date_start": "2026-08-01T00:00:00Z",
    "date_end": "2026-08-31T23:59:59Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Filters produce candidates; they do not authenticate the sender. Stop if more than one candidate remains plausible.

Read one selected message:

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

Use `get_email_context` only when the requested meaning depends on surrounding messages. Keep `query.limit` at 8 or fewer for this workflow and reuse returned cursors only when the user-requested source is still incomplete. `get_thread` may use `query.focus_email_id` and compact bodies when supported by the live schema.

## Draft contract

`save_draft` is an internal write. Its content field is `body.body` as a string:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "sender@example.com",
    "cc": [],
    "bcc": [],
    "subject": "Re: Original subject",
    "body": "Guten Tag ...\n\n--- Arabic mirror ---\n..."
  }
}
```

Recipients must be explicit. MCP does not infer Reply All. When replacing an existing draft, use the live schema's `draft_id` field rather than creating duplicates.

## Approved reply contract

`reply_to_email` is an external effect. Preview and approve its exact payload first:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "idempotencyKey": "language-reply-2026-08-27-a1",
  "body": {
    "to": "sender@example.com",
    "from": "agent@mermail.app",
    "subject": "Re: Original subject",
    "text": "Approved translated reply"
  }
}
```

Send-like tools use `body.text` and/or `body.html`, not `body.body`. Use one idempotency key for one exact approved payload. Do not retry a timeout or uncertain result with a new key.

## Disallowed routes

- No PayBox or Agent Wallet tools.
- No Composio Gmail or Outlook tools.
- No destructive tools.
- No mailbox-agent conversation tools unless the user separately requests that domain.
- No attachment download unless the user explicitly includes that attachment in the translation request and the selected email metadata proves the association.
