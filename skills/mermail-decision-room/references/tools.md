# Decision Room read tools

This workflow owns no tools. Reuse the canonical workspace and inbox contracts. Use the exact identifier exposed by the host, such as `Mermail:get_email`; never invent, strip, or add a namespace. Pass `query` as a native JSON object, never a stringified JSON blob. Inspect live schemas for optional arguments.

| Purpose | Existing tools | Canonical contract |
| --- | --- | --- |
| Resolve context only when needed | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Select and read evidence | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Retrieve a necessary selected attachment | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |

No writes belong to this workflow, including `save_draft`, `mark_thread_read`, or mailbox creation. No wallet, Composio, mailbox-agent delegation, or public research tools are required for thread analysis. Missing access is not permission to provision a resource or switch connectors.

## Bounded evidence collection

1. Reuse exact workspace/mailbox IDs already resolved. Otherwise discover within the user's scope; stop on ambiguity or unavailable mailbox. Prefer returned `public_id` as `mailboxId`.
2. Discover with `metadata_only: true` and `agent_safe_content: true`. Use actual schema filters; newest-first uses `sortColumn: "date"` and `sortDirection: "DESC"`, not a made-up combined sort field.
3. Read an exact message with `get_email` using `query: { "require_scan_status": "clean", "agent_safe_content": true, "max_body_chars": 10000 }`. Preserve omissions and returned provenance.
4. Use `get_email_context` with `query.limit: 8` for surrounding context. It returns oldest-first, sanitized, scan-gated pages; reuse the opaque `next_cursor` as `query.cursor`. A page is not necessarily the whole thread. Keep interpretation capped at 10,000 normalized text characters per message, even if a broader endpoint returns more.
5. Use `get_thread` only when its broader representation is needed and the live safety contract is satisfied. Do not use it to recover content withheld by a scan gate. Never invent unsupported arguments.
6. Stop at the declared budget, or take explicitly bounded further reads within scope to address a material gap. Record incomplete coverage and its decision impact. Do not claim absence of a term in the whole thread from a partial page.

For attachments, select exact `mailboxId`, `emailId`, and `attachmentId` from metadata and verify scan, type, and size first. Respect the MCP 1 MiB binary response limit and available safe parsing. Record inaccessible necessary evidence as BLOCKED; never guess a download URL.

## Availability

Use the current authenticated Mermail connection. Metadata references the hosted server at `https://console.mermail.app/mcp`; interactive OAuth is preferred and API-key mode remains a limited/headless fallback. Never ask for a key in chat. A restricted profile may omit a read operation; use only available equivalent safe reads within scope or report the limitation. Do not attempt a write or change authentication to bypass a boundary.

If the user supplies the thread directly, analyze only that supplied evidence without unnecessary MCP calls. Clearly disclose missing Mermail IDs and any incomplete provenance. This does not establish that a real mailbox was inspected.
