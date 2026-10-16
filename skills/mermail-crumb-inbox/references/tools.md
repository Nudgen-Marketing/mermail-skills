# Crumb inbox tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready inbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits |
| `search_emails` / `list_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted payment-request reads |
| `save_draft` | `mermail-compose-email` | Confirmation draft (`body.body` string) |
| `reply_to_email` | `mermail-compose-email` | Approved reply after exact preview |

Wallet/PayBox is out of scope. Never invoke `paybox_*`, `submit_agent_wallet_transfer`, or `paybox_request_transfer` from this skill.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "subject": "crumb",
    "date_start": "2026-09-02"
  }
}
```
