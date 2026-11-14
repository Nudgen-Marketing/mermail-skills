# Security questionnaire desk tool map

This persona **uses** tools owned by other official skills. Do not assign any of them to this skill in `tool-coverage.json`. Use the exact identifier exposed by the host, such as `search_emails` or `Mermail:search_emails`; never add, remove, or invent a namespace. Pass `query` and `body` as native JSON objects, never stringified JSON.

| Intent | Exact tool | Owner |
| --- | --- | --- |
| Resolve a mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find candidates | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read one selected message | `get_email` | `mermail-manage-inbox` |
| Download one approved attachment | `download_attachment` | `mermail-manage-inbox` |
| Save the default review artifact | `save_draft` | `mermail-compose-email` |
| Send an approved response | `reply_to_email` | `mermail-compose-email` |
| Forward an approved escalation | `forward_email` | `mermail-compose-email` |

## Bounded reads

Discover with metadata first:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Read one selected message:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 20000
  }
}
```

`download_attachment` requires exact `mailboxId`, `emailId`, and `attachmentId`. Verify those IDs against the selected message. The MCP bridge rejects binary responses over 1 MiB; this workflow also refuses larger files and requires exact, fresh authorization before download.

## Draft and external effects

`save_draft` uses a string in `body.body`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "customer@example.com",
    "subject": "Security questionnaire response",
    "body": "Q1: ..."
  }
}
```

`reply_to_email` and `forward_email` take the selected source `emailId` at top level. Their content uses required `body.from` and `body.text` and/or `body.html`, with explicit `body.to`, `body.cc`, and `body.bcc`; MCP does not auto-fill Reply All. Preview the exact final arguments and obtain fresh human approval before one call. Do not retry an ambiguous external effect with a new idempotency key.
