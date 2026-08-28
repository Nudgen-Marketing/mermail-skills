# Tool notes — mermail-ops-governance

Read-only observability set (safe, no side effects):
- `get_api_credit_usage` — remaining API credits for the authenticated workspace.
- `get_email_usage` — email send/receive volume against plan window.
- `get_workspace_storage` — aggregate bytes across the workspace.
- `get_mailbox_storage` — per-mailbox bytes; call once per mailbox from
  `list_mailboxes`. Prefer public_id UUIDs.

Governance primitive:
- `prepare_destructive_action` — issues a single-use confirmation token valid
  five minutes for one destructive operation. This skill NEVER executes a
  destructive tool without an active token from this call plus explicit
  operator confirmation in the same session.

Destructive tools this skill may drive (all require token + confirmation):
- `empty_trash`, `bulk_delete_emails`, `delete_email`
- `delete_folder`, `delete_custom_label`
- `remove_workspace_member`, `delete_email_domain`

Inventory tools used for blast-radius scoping:
- `list_mailboxes`, `search_emails`, `list_folders`, `list_workspace_members`

## Tool-coverage ownership

This skill owns exactly ONE tool: `prepare_destructive_action`. All usage,
storage, and inventory reads belong to `mermail-administer-workspace` /
`mermail-manage-inbox` and are consumed here strictly as cross-domain,
read-only workflow steps — ownership never moves.

## Rate limits

Observability reads are cheap but not free: cache per-run results, batch
per-mailbox storage reads sequentially, and surface rate-limit errors
verbatim instead of retrying in a loop.
