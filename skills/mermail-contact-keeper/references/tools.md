# Contact keeper tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_workspaces` | `mermail-administer-workspace` | Resolve the credential-bound workspace once |
| `list_mailboxes` | `mermail-administer-workspace` | Discover one ready receiving mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only on explicit authorization (10 credits; `email` + `name` required) |
| `search_emails` | `mermail-manage-inbox` | Bounded metadata-first candidate discovery within the scan window |
| `list_emails` | `mermail-manage-inbox` | Newest-first metadata fallback |
| `get_email` | `mermail-manage-inbox` | Bounded clean-content read for one validated candidate |
| `get_thread` | `mermail-manage-inbox` | Thread context after one candidate validates |

Require `scan_status` of `clean` before using body text. Metadata-only reads are preferred until a thread is selected.

## Drafts and sends

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Nudge drafts; string `body.body` |
| `send_email` | `mermail-compose-email` | Approved new nudge (`body.from` + `body.html` and/or `body.text`) |
| `reply_to_email` | `mermail-compose-email` | Approved in-thread nudge |

Send and reply nest Sold fields under `body`. MCP does not auto-fill Reply All; pass explicit `to`/`cc`/`bcc`. Every send or reply requires the authenticated user's explicit approval of the exact draft content and recipients.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "date_start": "2026-06-24"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
