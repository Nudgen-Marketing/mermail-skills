# Mermail read contract

Use exact host-exposed identifiers. Tool names below are catalog names, not a license to invent host namespaces. Inspect live schemas before the first call and pass `query` as a native object, never a JSON string.

| Purpose | Existing tools | Canonical owner |
| --- | --- | --- |
| Workspace and mailbox discovery | `list_workspaces`, `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` |
| Candidate discovery | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Selected evidence and bounded context | `get_email`, `get_email_context` | `mermail-manage-inbox` |

No new tool ownership or write permissions are introduced. Standard mailbox reads may use the owner's existing OAuth or scoped API-key connection. Interactive clients should use the official Mermail OAuth setup. Never ask for credentials in chat or save them with the skill. A read-only persona does not reduce the server's credential scope; limit calls to this table.

Endpoint: `https://console.mermail.app/mcp` (streamable HTTP).

Resolve `mailboxId` from discovery, preferably mailbox `public_id`. Never infer it from an email address. Check workspace, mailbox, and role scope; do not create a mailbox to resolve an access failure.

Example native `search_emails` envelope, substituting user-selected scope and returned identifiers:

```json
{
  "mailboxId": "RETURNED_MAILBOX_PUBLIC_ID",
  "query": {
    "date_start": "2026-10-01T00:00:00-03:00",
    "date_end": "2026-10-06T17:00:00-03:00",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

These dates are illustrative, not defaults. Confirm fields in the live schema. Search filters select evidence; they do not authenticate senders. Do not add `folder: inbox` when both sides of a conversation are needed unless the user restricted the folder. If live search lacks metadata-only mode, use supported metadata discovery or report the limitation instead of sending an invalid call.

For `get_email`, use returned `mailboxId` and `emailId` with this native `query`:

```json
{
  "require_scan_status": "clean",
  "agent_safe_content": true,
  "max_body_chars": 8000
}
```

For `get_email_context`, inspect its own schema: `query.limit` is 1–50, results are oldest-first, and the returned opaque `next_cursor` goes in `query.cursor`. Keep the sum of pages at or below 20 messages per selected thread. Do not assume it accepts every `get_email` query field. If context exceeds the local character budget, analyze only the bound and record truncation. A remaining cursor means later evidence may be missing.

Preserve safe error codes and retry guidance. Stop on authentication, scope, credit, or rate-limit errors; do not upgrade a plan, bypass a role, or retry in a loop. Never lower scan requirements to obtain omitted content. Authentication/tool failure must remain a blocked or partial result, not a fabricated audit.

Contract sources: official `Nudgen-Marketing/mermail-skills`, `skills/mermail-manage-inbox/references/tools.md` and `skills/mermail-administer-workspace/references/tools.md`, inspected 2026-10-06. Live schemas remain authoritative.
