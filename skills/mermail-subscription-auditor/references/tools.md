# Tools

This skill owns no MCP tools. It reuses tools owned by `mermail-administer-workspace`, `mermail-manage-inbox`, and `mermail-compose-email`, and follows their contracts.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_workspaces` | Find the workspace | read |
| `list_workspace_mailboxes` | Find the mailbox and confirm it can receive mail | read |
| `list_emails` | List recent messages, newest first | read |
| `search_emails` | Find receipt, invoice, and billing messages | read |
| `get_email` | Read metadata and scan status for one message | read |
| `get_email_context` | Read a bounded body for clean messages only | read |
| `save_draft` | Save an unsent cancellation draft for review | write-preview |
| `send_email` / `reply_to_email` | Send an approved cancellation email | external-effect |

## Examples

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
