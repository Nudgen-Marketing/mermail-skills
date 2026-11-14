# Deadline Radar tool contracts

This persona owns **no** MCP tools. It composes tools already owned by `mermail-administer-workspace` (mailbox discovery), `mermail-manage-inbox`, and `mermail-compose-email`. Use exact host-exposed identifiers (for example `Mermail:search_emails` when the host qualifies them). Pass `query` and `body` as **native JSON objects**.

| Operation | Existing tools | Owning domain |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes` (`list_workspaces` if needed); `create_mailbox` only if user-authorized | `mermail-administer-workspace` |
| Candidate discovery | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Read selected mail | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Optional attachment evidence | `download_attachment` after exact id + clean scan | `mermail-manage-inbox` |
| Organize | `update_email` (read/starred only), `move_email`, `list_folders` / `create_folder`, `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` |
| Draft follow-ups | `save_draft`, `regenerate_draft` | `mermail-compose-email` |
| Send (only after exact preview + fresh approval) | `reply_to_email`, `send_email` | `mermail-compose-email` |
| Destructive (rare; user-explicit) | `delete_email` + `prepare_destructive_action` | inbox + shared confirmation |

## Discovery pattern

1. Metadata-first list/search with small pages (`limit` ≤ 25, ≤ 3 pages unless the user widens the budget).
2. Prefer deadline vocabulary the user requested; do not run unbounded inbox walks.
3. `get_email` with `require_scan_status: "clean"`, `agent_safe_content: true`, and `max_body_chars` ≤ 10000.
4. Use `get_email_context` for conflicting dates in-thread; default ≤ 8 relevant messages.

Example search shape:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "q": "deadline OR \"due by\" OR invoice OR CFP OR RFP OR renew OR \"respond by\"",
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Inspect live `tools/list` schemas; field names may vary slightly. Do not invent filters.

## Organization notes

- `update_email` body may set `read` and/or `starred` only.
- Custom labels: MCP exposes definition CRUD (`create_custom_label` requires admin `name` + `rules`). **No** tool manually attaches a label to an existing message; prefer starring or folder moves for per-message organization.
- Do not invent escalate, calendar, or ledger tools.

## Composition notes

- Drafts use string `body.body`. Sends/replies use `body.text` and/or `body.html` plus required `body.from`.
- Recipients must be explicit on MCP; there is no `replyAll`.
- Never call PayBox / Agent Wallet tools from this skill (`paybox_*`, `*_agent_wallet_*`, x402 pay).
- Preserve structured errors; do not auto-retry uncertain external writes.

## Forbidden from this persona

| Tool class | Why |
| --- | --- |
| All `paybox_*` / Agent Wallet writes and reads for decisioning | Capital-zero demo; email must not drive money |
| `execute_composio_tool` for Gmail/Outlook | Keep mail in Mermail |
| `set_default_task_triager` | Unsupported curated workflow |
| Any invented deadline, calendar-event, or manual label-attach API | Not in catalog; use star/move/draft only |
