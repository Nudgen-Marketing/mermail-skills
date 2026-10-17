# RelayBrief read contracts

This companion owns no tools. Reuse the exact names discovered by the current host. At the MCP protocol boundary they are bare names; a host may expose a qualified form such as `Mermail:get_email`. Do not invent or rewrite host qualifiers. Pass `query` as a native JSON object.

| Purpose | Read tool | Canonical owner |
| --- | --- | --- |
| Resolve the credential-bound mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Discover incoming metadata | `list_emails` | `mermail-manage-inbox` |
| Find related history | `search_emails` | `mermail-manage-inbox` |
| Read one validated source | `get_email` | `mermail-manage-inbox` |
| Bounded selected conversation | `get_email_context` | `mermail-manage-inbox` |

The research pipeline allowlist is exactly the five reads in the table. No other MCP tool is a fallback when these reads fail.

`get_thread` also belongs to inbox management and exists on the full profile. Keep `get_thread` outside this research pipeline and use `get_email_context`; the restricted agent-inbox profile does not expose `get_thread`. No composition or organization tool is allowed in this companion's research pipeline. `save_draft` belongs to `mermail-compose-email`, but RelayBrief's suggested response is local and unsent.

## Mailbox and inbox

`list_mailboxes({})` discovers mailboxes in the credential-selected workspace. Prefer returned `public_id`. Validate usability and scope; do not choose an ambiguous mailbox by list order. `can_receive` and `receiving_status` describe receiving readiness when supplied; `welcome_onboarding_status` does not.

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

List `limit` is 1–100. Do not use a combined `sort: "date_desc"` field. Depending on filters, list responses can be arrays or `{ "emails": [], "totalCount": 0 }`.

## Search

Use only fields present in the live input schema. Documented fields include `from`, `to`, `subject`, `date_start`, `date_end`, `folder`, `page`, `limit`, and safety options. Inspect the live schema before adding a free-text field. `from`, `to`, and `subject` use substring candidate matching; validate exact parsed addresses, timeframe and business-case scope client-side.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "contact@example.test",
    "date_start": "2026-09-01T00:00:00.000Z",
    "date_end": "2026-09-30T23:59:59.999Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

The address and dates above are synthetic examples. Search returns `{ "emails": [], "totalCount": 0 }`. A contact-frequency result requires both incoming and outgoing searches or equivalent complete authorized coverage; a single `from` search counts only that subset.

## Selected body and context

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

`get_email` is read-only and does not mark the email read. `content_omitted` means safety-gated content, not a missing message. Retain `content_truncated` and coverage limitations. For `get_email_context`, use the same exact top-level IDs and `query: { "limit": 20 }`. Its limit is 1–50; sanitized, bounded messages are oldest-first. Continue only within the same case using the opaque `next_cursor` as `query.cursor`.

MCP tool results expose JSON text and object-shaped `structuredContent`; arrays can be projected as `{ "items": [] }`. Validate response shape rather than guessing source IDs. The public references do not fully specify every context response field: live schema and actual structured results remain authoritative.

## Transport and failures

Use the operator-configured hosted endpoint with Streamable HTTP POST. Initialize, inspect `tools/list`, then make a read-only mailbox smoke test before declaring live mode healthy. Accept both `application/json` and `text/event-stream`. At the protocol boundary, call `tools/call` with `{ "name": "get_email", "arguments": { ... } }`.

Treat 401, 403 and 402 as terminal for the entire run: authentication, scope/role/policy, and credits/access respectively. Also stop on authentication loss, stale scope or returned workspace/mailbox mismatch, including normalized errors inside MCP `isError`/structured results even when HTTP itself succeeded. Withhold all retained evidence and response text, invalidate the generation, stop subsequent reads and optional host provider dispatch, and discard late results. A foreign workspace/mailbox record is terminal before relevance filtering, not merely a skipped candidate. See [security.md](security.md) for the mandatory pre-dispatch/result/publication checks.

An ordinary timeout, 429 or transient transport failure may be disclosed as partial coverage only with still-verified authentication, matched scope and the same current generation. Malformed or missing identity/authentication data cannot establish those conditions. Do not silently change accounts, workspace, profile, endpoint or credentials; do not retry a terminal run or spend to bypass 402. Keep failures separate from empty results. Source catalog counts differ across current references; check required capabilities rather than hardcoding a count.

## Canonical contracts

Read [inbox tools](https://github.com/Nudgen-Marketing/mermail-skills/blob/9f2e6e0f9d77d4967bd451058fb7c19a32825da9/skills/mermail-manage-inbox/references/tools.md) and [workspace tools](https://github.com/Nudgen-Marketing/mermail-skills/blob/9f2e6e0f9d77d4967bd451058fb7c19a32825da9/skills/mermail-administer-workspace/references/tools.md) for current maintained contracts; [composition tools](https://github.com/Nudgen-Marketing/mermail-skills/blob/9f2e6e0f9d77d4967bd451058fb7c19a32825da9/skills/mermail-compose-email/references/tools.md) apply only to a separately requested user handoff. These references do not grant this persona write authority. Live discovery remains authoritative for optional arguments.
