# Tools

This skill owns **no MCP tools**. It orchestrates tools owned by other domain skills. Tool ownership is canonical in [`tool-coverage.json`](../../../tool-coverage.json) — each tool below has exactly one owning skill, and this skill must route to that owner's contract rather than re-implement it.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when list tools return it.
- Read the owning skill's `references/tools.md` for exact argument shapes, limits, and error contracts before calling a tool from a domain other than inbox reads.

## Cross-domain tool map

### Owned by `mermail-manage-inbox` (inspection and organization)

| Tool                                                                                        | Class            | Purpose in ops workflow                                |
| ------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `list_emails`, `search_emails`                                                              | read             | Bounded inbox inspection and daily triage              |
| `get_email`, `get_thread`, `get_email_context`                                              | read             | Context for a selected item                            |
| `list_folders`, `list_custom_labels`                                                        | read             | Organization discovery                                 |
| `move_email`, `bulk_move_emails`                                                            | reversible write | Safe organization after preview                        |
| `mark_thread_read`, `bulk_mark_emails_read`                                                 | reversible write | Clearing noise                                         |
| `create_folder`, `create_custom_label`                                                      | reversible write | New organization structures                            |
| `update_email`, `update_folder`, `update_custom_label`                                      | reversible write | Adjust organization                                    |
| `download_attachment`                                                                       | read             | Attachment inspection when the task requires it        |
| `delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`, `delete_custom_label` | **destructive**  | Only with `prepare_destructive_action` and exact scope |

### Owned by `mermail-compose-email` (preparation and external effects)

| Tool                                                                   | Class               | Purpose in ops workflow                     |
| ---------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| `save_draft`, `regenerate_draft`                                       | preparation         | Prepared, unsent responses                  |
| `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send` | **external effect** | Only after exact preview and fresh approval |

### Owned by `mermail-administer-workspace` (workspace context)

| Tool                                                               | Class               | Purpose in ops workflow                                       |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------- |
| `list_workspaces`, `list_mailboxes`, `get_mailbox`                 | read                | Resolve workspace and mailbox context                         |
| `get_api_credit_usage`, `get_email_usage`, `get_workspace_storage` | read                | Capacity context for ops planning                             |
| `invite_workspace_member`, `resend_workspace_invite`               | **external effect** | Out of normal ops flow; only with explicit user intent        |
| `remove_workspace_member`, `delete_email_domain`                   | **destructive**     | Out of normal ops flow; never during routine email operations |

### Owned by `mermail-automate-triage`

| Tool                                             | Class            | Purpose in ops workflow                           |
| ------------------------------------------------ | ---------------- | ------------------------------------------------- |
| `list_task_triagers`, `list_recent_triager_runs` | read             | Understand automation state before manual triage  |
| `create_task_triager`, `update_task_triager`     | reversible write | Draft-only automation changes on explicit request |
| `delete_task_triager`                            | **destructive**  | Only with `prepare_destructive_action`            |
| `set_default_task_triager`                       | unsupported      | Never call or invent; report as out of scope      |

### Owned by `mermail-composio`

| Tool                                                                             | Class               | Purpose in ops workflow                                         |
| -------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| `list_composio_connections`, `search_composio_tools`, `get_composio_tool_schema` | read                | Discover an external action only on explicit intent             |
| `execute_composio_tool`                                                          | **external effect** | Inspect the schema, preview exactly, approve, then execute once |
| `connect_composio_toolkit`                                                       | **external effect** | Never connect merely because it might be useful                 |
| `disconnect_composio_toolkit`                                                    | **destructive**     | Only with `prepare_destructive_action`                          |

### Owned by `mermail-mail-agent`

| Tool                                                     | Class               | Purpose in ops workflow                                                                    |
| -------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `list_agent_conversations`, `list_agent_messages`        | read                | Assistant conversation context                                                             |
| `chat_with_mailbox_agent`                                | **external effect** | Delegation needs its own approval; server-enforced allowlist governs what the agent may do |
| `create_agent_conversation`, `rename_agent_conversation` | reversible write    | Only on explicit request                                                                   |
| `delete_agent_conversation`                              | **destructive**     | Only with `prepare_destructive_action`; never for system conversations                     |

### Explicitly excluded

- All wallet-scoped and PayBox tools (`get_paybox_connection`, `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `submit_agent_wallet_transfer`, and the rest of `mermail-agent-wallet`). Money movement is never part of email operations; hand off to `mermail-agent-wallet` or `mermail-x402-agent` when the user independently requests it.

## Confirmation tool

`prepare_destructive_action` (owned by the MCP server, classified in `tool-coverage.json`) issues a short-lived, single-use token bound to the exact tool and arguments. Use it immediately before every destructive tool call and never pre-broaden the bound scope.
