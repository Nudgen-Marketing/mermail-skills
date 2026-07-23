# Inbox tool map

## Native MCP argument shape

Use the exact tool identifier exposed by the current host. Claude commonly
qualifies the tool as `Mermail:list_emails`; another host may expose a different
namespace or the bare `list_emails`. Do not manually add, strip, or invent an
alias. At the MCP protocol boundary, Mermail's `tools/list` catalog name remains
the bare `list_emails`.

Pass `query` as a native JSON object in every MCP call. Never JSON-encode,
escape, or stringify the object. For example, list the newest inbox message
metadata with:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 1,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

There is no `sort: "date_desc"` shortcut. Use the separate `sortColumn` and
`sortDirection` fields shown above. Treat list results as candidates, then read
the exact selected message ID:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Search filters use the same native-object rule:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "invoice",
    "from": "billing@example.com",
    "date_start": "2026-07-23T10:00:00.000Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use only fields exposed by the live tool schema. For older servers, omit
unsupported additive safety fields without changing the object shape.

## Read-only discovery

- `list_emails`, `get_email`, `search_emails`, `get_thread`
- `download_attachment`
- `list_folders`, `list_custom_labels`

## Reversible organization

- `update_email`, `bulk_mark_emails_read`, `bulk_move_emails`, `move_email`
- `mark_thread_read`
- `create_folder`, `update_folder`
- `create_custom_label`, `update_custom_label`

## Destructive

- `delete_email`, `bulk_delete_emails`, `empty_trash`
- `delete_folder`, `delete_custom_label`

Require explicit user approval and a token from `prepare_destructive_action`. Bind the token to the exact tool name and arguments and use it only once within five minutes.
