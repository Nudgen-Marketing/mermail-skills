# Tools

This cross-domain skill owns no MCP tools. It composes tools owned by the official focused skills below. If this reference and an owning skill differ, the owning skill's live schema, approval, and retry contract wins.

## Conventions

- Use the exact identifier exposed by the host, such as `search_emails` or `Mermail:search_emails`. Do not add, remove, or invent host qualification.
- Pass `query` as a native JSON object. Never stringify a JSON object into `query`.
- Prefer mailbox `public_id` as `mailboxId`.
- Resolve stable mailbox, message, thread, draft, and attachment IDs from reads; never infer them from display text.

## Composed tools

| Tool | Owning skill | Use here | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one ready proposal mailbox | read |
| `search_emails` | `mermail-manage-inbox` | Bounded RFP/vendor discovery | read |
| `list_emails` | `mermail-manage-inbox` | Newest-first fallback discovery | read |
| `get_email` | `mermail-manage-inbox` | Read one selected clean proposal message | read |
| `get_thread` | `mermail-manage-inbox` | Read one selected proposal conversation | read |
| `download_attachment` | `mermail-manage-inbox` | Fetch one necessary bounded attachment for safe parsing | read / local artifact |
| `save_draft` | `mermail-compose-email` | Save one reviewed clarification draft | write-preview |
| `reply_to_email` | `mermail-compose-email` | Send an approved clarification in the source thread | external-effect |
| `send_email` | `mermail-compose-email` | Send an approved new clarification message | external-effect |
| `forward_email` | `mermail-compose-email` | Forward an approved proposal or evaluation excerpt | external-effect |

This skill does not call delete, workspace administration, Composio execution, Agent Wallet, or PayBox tools.

## Bounded search example

Use the live schema and a native object:

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 25
  }
}
```

There is no `sort: "date_desc"` shortcut. Do not pass `"query": "{\"limit\":25}"`.

## Approval boundary

- Reads: no approval beyond the user's request.
- Draft: exact preview or an exact current-turn request for that draft.
- Send/reply/forward: exact preview and fresh approval immediately before the tool call.
- A completed evaluation is evidence for the user; it is not authorization for an external effect.
