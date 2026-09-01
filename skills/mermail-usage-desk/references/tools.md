# Usage Desk Tool Routing

This persona skill routes to existing focused owners rather than owning tools directly.

## Routed Tools (via mermail-administer-workspace)

All usage and storage reads route to `mermail-administer-workspace`:

| Tool | Purpose | Risk |
| --- | --- | --- |
| `get_api_credit_usage` | Retrieve current API credit balance and usage statistics | read |
| `get_email_usage` | Retrieve email consumption, RPM, and sending statistics | read |
| `get_workspace_storage` | Retrieve workspace-level storage totals | read |
| `get_mailbox_storage` | Retrieve per-mailbox storage breakdown | read |
| `list_workspaces` | Discover credential-bound workspace identity | read |
| `list_workspace_mailboxes` | List mailboxes for storage breakdown | read |
| `get_mailbox` | Resolve mailbox details for storage context | read |

## Tool Ownership

This skill does **not** claim tool ownership in `tool-coverage.json`. Tools remain owned by `mermail-administer-workspace` under `domains`. This persona provides focused usage-reporting workflow routing without duplicating ownership.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use exact tool identifiers as exposed by the host (e.g., `get_api_credit_usage`, potentially `Mermail:get_api_credit_usage` with host qualification).
- Prefer mailbox `public_id` as `mailboxId` when list tools return it.
- All usage and storage tools are read-only with `"risk": "read"`.

## Examples

Read current API credit balance:

```json
{
  "toolName": "get_api_credit_usage"
}
```

Read workspace-level storage:

```json
{
  "toolName": "get_workspace_storage"
}
```

Read per-mailbox storage breakdown:

```json
{
  "toolName": "get_mailbox_storage",
  "mailboxId": "mbx_..."
}
```

Never pass stringified JSON: use native objects for structured parameters.
