# Renewal Guardian tool contract

This persona uses tools owned by existing official skills. Do not add these tools to `tool-coverage.json` for this skill.

Use the exact tool identifier exposed by the connected host. Pass `query` and `body` as native JSON objects, never JSON strings. Prefer a mailbox `public_id` as `mailboxId`.

| Need | Tool | Owner | Constraint |
| --- | --- | --- | --- |
| Resolve one inbox | `list_mailboxes` | `mermail-administer-workspace` | Do not guess between multiple candidate mailboxes. |
| Find renewal notices | `search_emails` | `mermail-manage-inbox` | Use a bounded date window, page and limit; metadata-only first. |
| Inspect selected evidence | `get_email`, `get_thread` | `mermail-manage-inbox` | Require clean scan status before reading body content. |
| Save a response for review | `save_draft` | `mermail-compose-email` | A draft is not delivery. |

Example bounded discovery call:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "text": "renewal OR subscription OR trial ending OR price change",
    "date_start": "2026-08-30T00:00:00Z",
    "date_end": "2026-09-29T23:59:59Z",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

The search text and optional fields must be checked against the live schema before calling; not every host exposes every filter. Do not invent a tool for cancelling a subscription, reading a vendor account, or charging a wallet.
