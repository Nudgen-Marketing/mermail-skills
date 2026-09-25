# Double-opt-in introduction tools

This workflow uses tools owned by other official skills. Do not add them to this skill as a new domain in `tool-coverage.json`.

Pass structured arguments as native JSON objects. Prefer mailbox `public_id` as `mailboxId`. Use exact live tool identifiers.

## Mailbox and inbox reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one ready Mermail mailbox |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Narrowly find a consent request or reply |
| `get_email` | `mermail-manage-inbox` | Inspect one selected message and structured sender metadata |
| `get_thread` | `mermail-manage-inbox` | Confirm thread continuity and the bounded consent exchange |

Do not use inbox reads to discover new recipients outside the two user-selected participants.

## Draft and delivery

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Save separate consent requests or the final joint intro without sending |
| `send_email` | `mermail-compose-email` | Send an approved consent request or approved final joint intro |
| `reply_to_email` | `mermail-compose-email` | Reply in one participant's consent thread after exact approval |
| `schedule_email_send` | `mermail-compose-email` | Deferred send only when explicitly requested |

For send/reply, use `body.from` plus `body.html` and/or `body.text`. For `save_draft`, use string `body.body`. Keep To/Cc/Bcc separate.

### Example consent draft

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "alice@example.com",
    "subject": "Open to an introduction?",
    "body": "<p>Would you be open to an introduction to Bob about a Solana analytics partnership? I will only connect you if both sides opt in.</p>"
  }
}
```

### Example final send

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "intro-alice-bob-approved-1",
  "body": {
    "to": ["alice@example.com", "bob@example.com"],
    "from": "introductions@mermail.app",
    "subject": "Intro: Alice ↔ Bob",
    "text": "Alice, meet Bob. Bob, meet Alice. You both opted in to connect about the Solana analytics partnership. I'll leave it to you from here."
  }
}
```

Preview and approve the exact final payload before `send_email`. Reuse an idempotency key only for the identical operation and payload; never use a new key to replay an uncertain send.
