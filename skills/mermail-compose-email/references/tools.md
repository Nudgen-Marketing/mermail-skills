# Composition tool map

| Intent | Tool | Effect |
| --- | --- | --- |
| Save editable content | `save_draft` | Internal write |
| Regenerate draft with AI | `regenerate_draft` | Internal write and AI usage |
| Send new email | `send_email` | External effect |
| Reply to email | `reply_to_email` | External effect |
| Forward email | `forward_email` | External effect |
| Schedule delivery | `schedule_email_send` | Deferred external effect |

## MCP argument nesting

Always pass Sold API fields under the tool's `body` argument (path params like `mailboxId` stay top-level). Flat Sold fields are also accepted and folded into `body`.

`mailboxId` accepts `public_id` (UUID), hosted alias id, or current email — prefer `public_id` from `list_mailboxes`.

### Send / reply / forward

Content fields are **`html` and/or `text`** — not `body` or `content`. `from` is required.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "send-2026-07-21-a1",
  "body": {
    "to": "customer@example.com",
    "from": "you@mermail.app",
    "subject": "Hello",
    "text": "Plain text body"
  }
}
```

Aliases accepted for send-like tools: `body` or `content` string → `text` (or `html` if the string looks like HTML).

### Draft / schedule

Content field is the string **`body`** (HTML or text). Do not use `html`/`text` for drafts.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "customer@example.com",
    "subject": "Hello",
    "body": "<p>Draft HTML</p>"
  }
}
```

Schedule also requires `scheduled_send_at` (ISO datetime) on `body`.

### If you see `Invalid request`

Read `code: "validation_failed"` and the `details` array from the tool result — they name the missing or wrong fields (for example `body: Either 'html' or 'text' must be provided`).
