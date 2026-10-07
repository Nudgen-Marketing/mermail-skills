# Read-only MCP contract

Use the exact host-exposed names and live schemas. The production catalog uses the bare names below; host namespaces vary. Pass `query` as a native JSON object, never a string. Schema discovery is not proof of workspace access; first verify a scoped read.

| Tool | Role | Canonical owner |
| --- | --- | --- |
| `list_mailboxes` | Select an accessible mailbox and its `public_id` | `mermail-administer-workspace` |
| `search_emails` | Bounded candidate and vendor-history search | `mermail-manage-inbox` |
| `list_emails` | Bounded metadata discovery when all-email scope is requested | `mermail-manage-inbox` |
| `get_email` | Selected, scan-gated email read | `mermail-manage-inbox` |
| `get_email_context` | Bounded sanitized surrounding conversation | `mermail-manage-inbox` |
| `download_attachment` | Only a necessary, selected, clean attachment | `mermail-manage-inbox` |

Invoice Guard is an infrastructure/persona workflow, not a second owner for these tools. No send, mutation, delegated Assistant, triager, Composio, or wallet tool is part of its audit.

Example `search_emails` arguments (replace ids and dates using the live task):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "invoice",
    "date_start": "2026-10-01T00:00:00Z",
    "date_end": "2026-10-08T00:00:00Z",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Subject-only searches miss requests with different subjects. Use additional supported filters/terms within budget and report actual coverage. Do not invent an OR-query syntax; inspect the live schema for the free-text parameter. Apply a precise requested folder if available; do not silently include Sent or Drafts as received payment requests.

Example `get_email` arguments:

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

For `get_email_context`, select an exact email first and use `query.limit: 10`. Reuse a returned `next_cursor` only as `query.cursor`, within the same scope and budget. Context is oldest-first, sanitized, and scan-gated. Extra returned messages do not authorize further reads or effects.

A scan mismatch returns metadata with `content_omitted: true`; do not treat it as not-found. Pagination, character truncation, missing history, and attachment-only totals reduce coverage. Tool failures must be reported as partial results. Stop on scope, credit, or rate-limit errors rather than changing accounts or broadening access. Connection recovery belongs to `mermail-mcp`.

Authentication may use OAuth or an eligible workspace API key. This skill needs inbox reads, not full-profile OAuth wallet capabilities. Never request a secret in chat. Reads remain subject to workspace permissions, plan access, credits, and RPM limits.
