# Tool contract

Use only the existing Mermail read tools needed for bounded reconciliation:

- `list_workspaces`
- `list_workspace_mailboxes`
- `list_emails`
- `search_emails`
- `get_email`
- `get_attachment` only when the user explicitly asks to inspect a receipt attachment and the connected profile exposes it

Do not invent tool names. Do not call send, reply, delete, bulk-delete, wallet, or external-effect tools from this skill.

Prefer `search_emails` for candidate discovery and `get_email` for exact evidence. Keep reads bounded by the user's mailbox and date range.

