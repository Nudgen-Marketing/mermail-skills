# Tools

This skill owns no Mermail tools. It coordinates existing focused skills and their contracts.

| Operation | Existing tools | Canonical owner |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Search/read renewal mail | `list_emails`, `search_emails`, `get_email`, `get_thread` | `mermail-manage-inbox` |
| Save a cancellation/refund draft | `save_draft` | `mermail-compose-email` |

Pass structured arguments as native JSON objects. Prefer mailbox `public_id` as `mailboxId`. Use bounded searches and exact identifiers. Never invent tool names or duplicate ownership in `tool-coverage.json`.
