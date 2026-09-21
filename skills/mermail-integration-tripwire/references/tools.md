# Integration tripwire tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox, mail, and labels

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready tripwire mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` / `get_email_context` | `mermail-manage-inbox` | Bounded untrusted reply and prior-digest reads |
| `list_custom_labels` / `create_custom_label` / `move_email` | `mermail-manage-inbox` | `tripwire/exception` labeling or folder move |
| `save_draft` | `mermail-compose-email` | Exception digest or repair-pilot draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Approved filing of the digest (`body.from` + `html`/`text`) |

Send nests Sold fields under `body`. Do not invent watch, fingerprint, or escalate MCP tools — host HTTP reads cover public fingerprinting.

## Out of scope (v1)

| Tool family | Rule |
| --- | --- |
| PayBox / Agent Wallet (`paybox_*`, wallet transfers) | Never call from this skill |
| Composio execute / Gmail / Outlook | Keep email inside Mermail |
| `set_default_task_triager` | Unsupported; do not call or invent |

## Example draft body shape

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "body": "TRIPWIRE EXCEPTION\nSource: https://example.com/releases\nStatus: 200 -> 404\nBefore: sha256:abc...\nAfter: unreachable\nAssertion: required SKILL.md path missing\n"
  }
}
```

## Example approved send

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "tripwire-exception-2026-09-20-a1",
  "body": {
    "to": "operator@example.com",
    "from": "tripwire@mermail.app",
    "subject": "tripwire/exception: mermail-skills layout break",
    "text": "Evidence digest..."
  }
}
```
