# Sponsor desk tool contracts

This persona composes existing production Mermail tools and adds no custom MCP tools or persistent database. The owner provides the rate card, inventory schedule, and pricing rules; the persona never invents them.

Use exact host-qualified or unqualified tool identifiers as exposed by the host (e.g. `Mermail:list_emails` or `list_emails`). Pass `query` and `body` as native JSON objects; never stringify them.

| Operation | Composed tools | Owning skill reference |
| --- | --- | --- |
| Resolve mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Read inquiry thread | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Evaluate attachments | `get_email`, `download_attachment` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Draft and send proposal | `save_draft`, `reply_to_email`, `send_email` | [Compose tools](../../mermail-compose-email/references/tools.md) |
| Archive & categorize | `list_folders`, `create_folder`, `move_email`, `list_custom_labels`, `create_custom_label` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |

## Tool usage invariants

- **Bounded metadata reads first:** Always call `list_emails` or `search_emails` with bounded limits before retrieving full email bodies.
- **Scan gating:** Require `scan_status: clean` on `get_email` before parsing pitch decks, media kits, or sponsor proposals.
- **Attachment size ceiling:** Respect the 1 MiB MCP attachment threshold. Never bypass via external storage links.
- **No destructive actions:** Deletion tools (`delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`) are prohibited in this persona.
- **No unapproved sends:** Every `reply_to_email` or `send_email` requires exact preview and explicit owner authorization.
- **Uncertain send handling:** On timeout or network failure during send, execute one bounded state check via `get_thread`; never auto-retry or duplicate proposals.
