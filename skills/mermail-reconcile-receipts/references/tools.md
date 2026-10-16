# Read-only MCP contract

Use the exact host-exposed identifier, for example `Mermail:search_emails` if
that is what the host lists. Tool names below are the protocol catalog names.
Inspect live schemas; `query` values are native JSON objects, never JSON strings.

| Tool | Canonical owner | Use here |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one usable mailbox |
| `search_emails` | `mermail-manage-inbox` | Discover within the chosen scope |
| `get_email` | `mermail-manage-inbox` | Read a selected, scan-gated message |
| `get_email_context` | `mermail-manage-inbox` | Clarify one selected record |

Prefer the returned mailbox `public_id`. Stop on a disabled, unavailable, or
ambiguous mailbox. Do not provision one implicitly.

An example bounded search, after confirming the live filter fields:

```json
{
  "mailboxId": "RETURNED_PUBLIC_ID",
  "query": {
    "subject": "invoice",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-30T23:59:59Z",
    "page": 1,
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use user-resolved dates, not the illustrative dates above. Search terms and
filters find candidate evidence; they do not authenticate the sender. Include
receipt, refund, and credit-note searches when in scope, within the shared budget.

Read only after choosing an exact returned email ID:

```json
{
  "mailboxId": "RETURNED_PUBLIC_ID",
  "emailId": "SELECTED_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Treat `content_omitted: true` as a missing-content reason, not “no invoice.”
For `get_email_context`, use a small `query.limit` (for example 5), reuse only the
returned opaque cursor, and count all inspected messages against the shared
budget. It returns bounded, sanitized, scan-gated context.

Attachments are outside the automatic workflow: request only a separately
authorized, necessary attachment through `mermail-manage-inbox`, preserving its
scan and 1 MiB MCP limits. Do not guess a download URL. No email link needs to be
opened to complete the reconciliation report.

API-key/OAuth workspace scope, plan, credit, and rate limits still apply. On a
401/403, stop and report connection/scope failure. On a 402 or 429, preserve the
partial evidence and surface the limit or Retry-After; do not buy credits, widen
scope, switch identities, or loop. No Agent Wallet tool is used by this skill.
