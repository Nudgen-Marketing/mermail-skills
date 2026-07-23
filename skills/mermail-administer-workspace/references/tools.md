# Workspace administration tool map

## Usage and discovery

- `get_api_credit_usage`, `get_email_usage`
- `list_workspaces`, `get_workspace`, `get_workspace_storage`
- `list_workspace_members`, `list_email_domains`
- `list_workspace_mailboxes`, `list_mailboxes`, `get_mailbox`, `get_mailbox_storage`

## Administrative writes

- `update_workspace`, `update_member_role`
- `invite_workspace_member`, `resend_workspace_invite` — require an exact-recipient preview and approval
- `add_email_domain`, `verify_email_domain` — require Developer-plan access
- `create_mailbox` — list first; make one explicitly authorized provision with no blind write retry
- `update_mailbox_settings`

## Destructive

- `delete_workspace`, `remove_workspace_member`, `delete_email_domain`

Require explicit approval and a single-use token from `prepare_destructive_action`. Workspace deletion must include a clear impact warning before approval.
