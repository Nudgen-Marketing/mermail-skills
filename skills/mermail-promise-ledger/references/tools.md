# Read tool contract

Use the exact host-qualified identifier available in the AI client. Protocol names below are bare. Inspect live schemas; pass `query` as a native JSON object, never stringified JSON. Prefer direct MCP reads when the client exposes them.

| Tool | Purpose | Canonical owner |
| --- | --- | --- |
| `list_mailboxes`, `get_mailbox` | Resolve selected address/public_id and access/readiness | mermail-administer-workspace |
| `search_emails`, `list_emails` | Find candidate metadata in user-selected scope | mermail-manage-inbox |
| `get_email` | Read one selected, scan-gated message | mermail-manage-inbox |
| `get_email_context` | Read bounded sanitized thread context after selection | mermail-manage-inbox |

Example `list_emails` arguments:

```json
{"mailboxId":"RETURNED_PUBLIC_ID","query":{"folder":"inbox","page":1,"limit":10,"sortColumn":"date","sortDirection":"DESC","metadata_only":true,"agent_safe_content":true,"require_scan_status":"clean"}}
```

For narrower discovery use `search_emails` with user-selected `subject`, `date_start`, `date_end`, `page`, `limit`, `metadata_only`, `agent_safe_content`, `require_scan_status`. Match candidates client-side; filters use substrings.

Example `get_email` arguments:

```json
{"mailboxId":"RETURNED_PUBLIC_ID","emailId":"RETURNED_MERMAIL_ID","query":{"agent_safe_content":true,"require_scan_status":"clean","max_body_chars":10000}}
```

Example `get_email_context` arguments:

```json
{"mailboxId":"RETURNED_PUBLIC_ID","emailId":"RETURNED_MERMAIL_ID","query":{"limit":20}}
```

Use only returned opaque `next_cursor` as `query.cursor`, within the skill's budget. Context is oldest-first; do not assume the seed is present on every page. Inspect result flags for truncation/omission. Tool errors are failures even if HTTP transport succeeded. Prefer `structuredContent`; JSON text may wrap arrays as `items`. Do not fabricate an ID from an RFC `message_id`.

The full endpoint is https://console.mermail.app/mcp. The optional https://console.mermail.app/mcp?profile=agent-inbox profile includes all these read tools and mechanically enforces stronger projections. It excludes sends, wallet operations and administrative mutations. Do not silently change profiles. Interactive clients should use OAuth; API keys are a limited headless fallback and must stay in environment/secret storage, never chat or committed config.

Workspace scope, credits, plan and RPM apply. On 401/403/402 stop with the access issue. On 429 report Retry-After and wait for the user's next attempt; do not loop or switch credentials. On response_too_large narrow this thread/page. Never weaken scan gates to obtain content.

Sources: https://docs.mermail.app/ai/mcp and official mermail-manage-inbox tool contracts, inspected October 2, 2026.
