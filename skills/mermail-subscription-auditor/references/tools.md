# Tools

This skill recomposes read-side MCP tools owned by other official skills. It owns no business tool; it never changes tool ownership. Tools are listed here because the agent calls them in this specific sequence during an audit.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace. Never cross into another workspace. | read |
| `list_mailboxes` / `list_workspace_mailboxes` | Resolve the target mailbox; prefer `public_id`. | read |
| `search_emails` | Primary discovery with `date_start`/`date_end` window and sender/subject filters. | read |
| `list_emails` | Newest-first fallback when search returns nothing. | read |
| `get_email` | Read a clean-scanned candidate body for extraction. | read |
| `get_email_context` / `get_thread` | Bounded thread context when one invoice spans a thread. | read |
| `save_draft` | Create a cancellation draft after exact preview. The only write this skill performs. | external-effect (draft only; never sent) |

Do not call: `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`, `delete_email`, `bulk_delete_emails`, `move_email`, `prepare_destructive_action`, or any PayBox/`paybox_*` tool from this skill.

## Examples

Bounded 90-day candidate search:

```json
{
  "query": {
    "date_start": "2026-05-15",
    "date_end": "2026-09-02",
    "query": "receipt OR invoice OR subscription OR renewal"
  }
}
```

Do not pass `"query": "{\"date_start\":\"2026-05-15\"}"`.
