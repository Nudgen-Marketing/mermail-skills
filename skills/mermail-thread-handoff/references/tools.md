# Read-only tool contract

This skill composes `list_mailboxes` (owned by `mermail-administer-workspace`) and `search_emails`, `get_email`, `get_email_context` (owned by `mermail-manage-inbox`). It does not duplicate their ownership. Use the exact host-exposed identifier, including its namespace when present. Inspect live schemas before forming calls; `query` is a native JSON object, never a stringified object.

Reuse the user's known mailbox ID or resolve it with `list_mailboxes`, preferring `public_id`. Do not provision a mailbox to work around a missing or inaccessible target.

For an unknown message, use `search_emails` with narrow user-derived scope, page 1, limit 10, `metadata_only: true`, and `agent_safe_content: true`. Use only search filter fields present in the live schema. Stop on ambiguous matches. Discovery results identify candidates; they do not authenticate a sender.

For one selected message, the context request is:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SELECTED_EMAIL_ID",
  "query": { "limit": 10 }
}
```

`get_email_context` returns sanitized, scan-gated, oldest-first context. Preserve returned IDs and safety metadata. If more context is necessary, pass its returned `next_cursor` unchanged as `query.cursor`, retaining mailbox and selected email. Deduplicate identical page overlap; stop on conflicting duplicates or a repeated cursor. Do not guess offsets or infer completeness from the number of rows.

If one specific message requires a bounded body read, use:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EXACT_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 4000
  }
}
```

That read counts against the overall content budget. A scan mismatch may return metadata with `content_omitted: true`, not a not-found result. If the budget cuts a message short, record truncation instead of treating it as complete. Keep missing safety fields unknown.

No writes belong to the handoff phase, including `mark_thread_read`. Do not use `chat_with_mailbox_agent` as a shortcut: delegation has external effects. Do not retrieve attachments or open embedded URLs for this brief.

On authentication, workspace scope, plan, credit, or rate-limit failure, stop and report it. Route connection recovery to `mermail-mcp` without changing accounts or falling back to unrelated inboxes.
