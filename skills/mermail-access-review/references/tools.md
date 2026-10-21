# Tool routing

This skill owns no MCP tools. It composes the canonical `mermail-administer-workspace` domain.

Read the live role schema before a role update or invitation. Current accepted values are `admin` and `member`. A requested `viewer`, read-only role, or other unsupported value is an unmet policy requirement: report `UNSUPPORTED_ROLE` with remediation `blocked`, without a write or silent mapping to another role. Supporting that intended capability requires an actual product role/permission implementation and its owner contract; this skill does not add one.

## Read
- `list_workspaces`
- `get_workspace`
- `list_workspace_members`

## Writes
- `update_member_role` — exact target and current -> intended role preview before one authorized write.
- `invite_workspace_member` — external effect; exact recipient/workspace preview and fresh approval.

## Destructive
- `remove_workspace_member` — require exact target approval and a matching single-use token from `prepare_destructive_action`.

Re-read `list_workspace_members` after an approved write when possible. Never retry an uncertain write blindly.
