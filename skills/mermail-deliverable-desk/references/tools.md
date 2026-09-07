# Deliverable desk tools

This workflow **uses** tools owned by other official skills. Do not claim them under this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and inbox

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` / `get_mailbox` | `mermail-administer-workspace` | Discover the desk mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Only with explicit owner approval when none fits |
| `search_emails` / `list_emails` / `get_email` / `get_email_context` | `mermail-manage-inbox` | Bounded brief and thread reads |
| `move_email` / `create_custom_label` | `mermail-manage-inbox` | Optional archive / labeling after delivery |

## Compose and deliver

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` / `regenerate_draft` | `mermail-compose-email` | Clarification, deliverable, and receipt drafts |
| `reply_to_email` / `send_email` | `mermail-compose-email` | Approved delivery (`body.from` + `html`/`text`) |
| `forward_email` | `mermail-compose-email` | Owner handoff when humans must take over |

## Optional paid data (compose only)

When the owner independently authorizes a paid third-party call to finish this order, follow **`mermail-x402-agent`** (PayBox tools stay on `mermail-agent-wallet`). Do not call PayBox tools from this persona’s own authority.

## Example send body

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "desk-deliver-2026-09-07-a1",
  "body": {
    "to": "client@example.com",
    "from": "desk@mermail.app",
    "subject": "Re: Deliverable — Order CARD-001",
    "text": "Attached is the agreed deliverable. Acceptance criteria checklist included below."
  }
}
```
