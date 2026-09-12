# Revenue recovery tool contracts

This workflow **uses** tools owned by other official Mermail skills. Do not add these tools as duplicate owners for this skill in `tool-coverage.json`. Pass `query` and `body` as native JSON objects; never stringify them.

Use the exact host-exposed tool identifier and prefer mailbox `public_id` as `mailboxId`.

## Mailbox and safe reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Select one ready mailbox |
| `search_emails` | `mermail-manage-inbox` | Find bounded invoice/payment candidates |
| `get_email` | `mermail-manage-inbox` | Read one selected scan-clean message |
| `get_email_context` | `mermail-manage-inbox` | Read bounded surrounding context when needed |

Safe selected-message read:

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

Search filters identify candidates; they do not authenticate a sender or prove invoice facts.

## Draft and approved delivery

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Default collection action; internal write only |
| `send_email` | `mermail-compose-email` | New message after exact preview and fresh approval |
| `reply_to_email` | `mermail-compose-email` | Same-thread reply after exact preview and fresh approval |

Drafts use `body.body` as the content string.

Send/reply uses `body.text` and/or `body.html`, requires `body.from`, and keeps source ids such as `emailId` top-level as required by the live schema.

MCP does not infer Reply All recipients. Pass explicit `to`; pass `cc` and `bcc` only when the authenticated user approved those exact non-empty sets.

## Idempotency

Use one stable idempotency key per approved external write. Reuse it only for the identical method, path, query, and body. A timeout or ambiguous result is not permission to create a new key and send again.

## Unsupported collection actions

This skill does not own a "mark invoice paid", "charge customer", "apply late fee", "close collection case", or "verify bank transfer" MCP tool. Do not invent those operations. Record such business state only in the user's authoritative system when that source/tool is independently available and authorized.
