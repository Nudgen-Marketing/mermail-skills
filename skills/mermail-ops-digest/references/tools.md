# Tools used by mermail-ops-digest

This skill does **not** own MCP tools. It routes through existing Mermail inbox and compose capabilities. Use the exact host-qualified tool names your client exposes (for example `Mermail:list_emails`).

## Prerequisites

- `list_mailboxes` / mailbox get — resolve `mailboxId` (`public_id`)
- Prefer metadata-only reads before full body reads

## Typical read path

| Step | Tools |
| --- | --- |
| Snapshot | `list_emails` or `search_emails` with `metadata_only: true`, `folder: "inbox"`, `sortColumn: "date"`, `sortDirection: "DESC"`, small `limit` |
| Open one message | `get_email` with `require_scan_status: "clean"`, `agent_safe_content: true`, bounded `max_body_chars` |
| Thread context | `get_email_context` or `get_thread` when needed |

Pass `query` as a **native JSON object**, never a stringified blob.

## Typical write path (approval required)

| Action | Tools |
| --- | --- |
| Organize | `move_email`, `bulk_move_emails`, `bulk_mark_emails_read`, `update_email`, `mark_thread_read` |
| Draft | `save_draft`, `regenerate_draft_with_ai` |
| Send (only after exact preview approval) | `reply_to_email`, `send_email` |
| Destructive | `delete_email` / `bulk_delete_emails` / `empty_trash` **after** `prepare_destructive_action` |

Do not call wallet/`paybox_*` tools from this skill. Route payment jobs to `$mermail-agent-wallet` or `$mermail-x402-agent` only when the user explicitly asks.
