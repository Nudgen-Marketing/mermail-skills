# Inbox research-brief tool contracts

This persona **owns no tools**. It reuses existing Mermail inbox and draft capabilities. Do not invent tool names.

Use the exact host-exposed identifiers (including qualification such as `Mermail:list_emails`). Pass `query` and `body` as native JSON objects.

| Operation | Existing tools | Contract |
| --- | --- | --- |
| Resolve mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Discover / read mail | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Optional attachment | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Persist brief as draft | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Optional same-thread ack | `reply_to_email` only after exact owner authorization | [Composition tools](../../mermail-compose-email/references/tools.md) |

## Hard exclusions

Never call from this skill: any `paybox_*` tool, Agent Wallet connect/transfer tools, `prepare_destructive_action` for wallet writes, or destructive inbox bulk deletes unless the owner independently requested that exact cleanup outside the brief workflow.

## Failure handling

Preserve structured errors. A validation failure calls for correcting the invalid field, not broadening authority. On uncertain external writes, one bounded reconcile then stop.
