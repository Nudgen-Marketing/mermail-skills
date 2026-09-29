# Mermail tool boundary

This skill owns no new MCP tools. It reuses the existing tool owners in the official package:

- `list_mailboxes` from workspace discovery;
- `list_emails` / `search_emails` for bounded candidate discovery;
- `get_email` for selected scan-clean content;
- `save_draft` only for an explicitly requested unsent digest;
- `prepare_destructive_action` is not needed because this skill performs no destructive action.

Use the exact tool names exposed by the current host. Host-qualified names may appear as `Mermail:list_emails`; do not invent or normalize a prefix.

Pass `query` and `body` as native JSON objects, never stringified JSON. Prefer `public_id` returned by `list_mailboxes` as `mailboxId`.

Recommended discovery query:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Recommended selected-message query:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Verify live schemas with MCP `tools/list`; optional fields vary by host and deployment.
