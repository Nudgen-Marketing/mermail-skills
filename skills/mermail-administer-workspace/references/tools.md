# Workspace administration tool map

## Usage and discovery

- `get_ai_credit_usage`, `list_ai_credit_events`, `get_api_credit_usage`, `get_email_usage` — AI credit allowance, charged/reserved/remaining amounts, mode, renewal, and bounded event history are separate from API and provision credits. See [ai-credits.md](ai-credits.md).
- `list_workspaces`, `get_workspace`, `get_workspace_storage`
- `list_workspace_members`, `list_email_domains`
- `list_workspace_mailboxes`, `list_mailboxes`, `get_mailbox`, `get_mailbox_storage`

## Administrative writes

- `update_workspace`, `update_member_role`
- `invite_workspace_member`, `resend_workspace_invite` — require an exact-recipient preview and approval
- `add_email_domain`, `verify_email_domain` — require Developer-plan access
- `create_mailbox` — list first; `body` requires `email` and `name`, while `workspaceId` is optional for credential-bound MCP when the live schema permits omission. Pass the exact resolved workspace ID when CLI, REST, or another live transport requires it. Make one explicitly authorized provision with no blind write retry.
- `update_mailbox_settings` — mailbox-admin only. For email response behavior, inspect existing settings and modify only the intended `settings.agentAutoResponse.mode` (`draft_for_review` or `automatic_triage`), preserving the remaining policy and mailbox settings. Use the live input schema and verify with `get_mailbox`; this is separate from `set_default_task_triager`.

## Destructive

- `remove_workspace_member`, `delete_email_domain`

Require explicit approval and a single-use token from `prepare_destructive_action`. The current MCP catalog does not expose `delete_workspace`; do not invent or call that removed tool.
