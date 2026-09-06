# Reply queue tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes` (`create_mailbox` only if authorized) | `mermail-administer-workspace` |
| List / search inbox | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Open a message / thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Draft a reply | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send an approved reply | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Optional organization | `list_folders`, `update_email`, `move_email`, `bulk_mark_emails_read` | `mermail-manage-inbox` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |

## Out of scope

| Do not call | Why |
| --- | --- |
| `paybox_*`, Agent Wallet, x402 payment tools | Inbox-only skill; never open wallet scopes |
| `send_email` for cold outbound | Use `mermail-gtm-agent` / `mermail-compose-email` for new outbound |
| Gmail/Outlook Composio toolkits | Keep email inside Mermail |
| Invented `respond` / `close_ticket` / `build_queue` tools | Map intents to real Mermail operations above |

## Examples

List newest unread metadata:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "unread": true,
    "metadata_only": true,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 20
  }
}
```

Do not pass `"query": "{\"unread\":true}"`.

Draft while reviewing:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "body": "Thanks for writing — I will confirm the details and reply shortly."
  }
}
```

Approved reply:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "body": {
    "to": "alice@example.com",
    "from": "ops@mermail.app",
    "text": "Thanks for the note — here is the next step."
  }
}
```
