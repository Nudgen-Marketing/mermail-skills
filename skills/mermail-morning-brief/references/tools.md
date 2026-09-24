# Morning-brief tool contract

MCP tools this skill uses. Ownership stays with the canonical skills in `tool-coverage.json`; this skill is a workflow composer, not a new tool owner.

| Intent | Tool | Effect |
| --- | --- | --- |
| Resolve sending mailbox | `list_mailboxes` | Read |
| Verify delivery | `list_emails` | Read |
| Send the digest now | `send_email` | External effect |
| Schedule the digest | `schedule_email_send` | Deferred external effect |
| Stage for review | `save_draft` | Internal write |

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Prefer mailbox `public_id` as `mailboxId` (from `list_mailboxes`).
- Sold API fields go under the tool's `body` argument; `mailboxId` stays top-level.
- Send-like tools need `body.html` and/or `body.text` plus required `body.from`. This skill sends plain `text`.
- Draft/schedule content uses the string field `body.body`, not `html`/`text`.
- Always pass a top-level `idempotencyKey` on sends (e.g. `brief-20261007-1`). Never retry an ambiguous send with a new key.

## Examples

Send a brief:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "brief-20261007-1",
  "body": {
    "to": "user@example.com",
    "from": "you@mermail.app",
    "subject": "Morning brief: web3 bounties — 2026-10-07 (5 items)",
    "text": "1. Title — https://example.com/1\n   Why it matters: one line."
  }
}
```

Schedule a brief:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "user@example.com",
    "from": "you@mermail.app",
    "subject": "Morning brief: CVEs — 2026-10-08 (5 items)",
    "body": "Plain-text digest snapshot.",
    "scheduled_send_at": "2026-10-08T01:00:00Z"
  }
}
```

Free-workspace recipient limits apply (10 recipients/request, 10 units/min, 50/hour, 200/day). On `400 email_send_recipient_limit_exceeded` or `429 email_send_rate_limit_exceeded`, stop and report — do not retry or alter the approved recipient set.
