# Signup OTP watch — tool map

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Prefer mailbox `public_id` as `mailboxId`.

MCP endpoint: `https://console.mermail.app/mcp`  
Prefer verification profile when available: `https://console.mermail.app/mcp?profile=agent-inbox`

## Ownership note (official package)

These tools are already owned in `tool-coverage.json` by:

| Tool | Canonical owner |
| --- | --- |
| `list_workspaces` | `mermail-administer-workspace` |
| `list_mailboxes` / `create_mailbox` / `get_mailbox` | `mermail-administer-workspace` |
| `list_emails` / `search_emails` / `get_email` / `get_email_context` | `mermail-manage-inbox` |

This skill is a **focused signup-OTP workflow** over those surfaces. Before an official merge, maintainers must decide whether to:

1. keep it as a companion / infrastructure route that does **not** duplicate ownership, or  
2. fold the workflow into `mermail-agent-inbox`.

Do not invent tool names. Use the exact host identifier (`search_emails` or `Mermail:search_emails`).

## Mailbox discovery and provision

- `list_mailboxes` — call `list_mailboxes({})` first. Reuse an exact usable mailbox for the same signup service when possible.
- `get_mailbox` — verify `public_id`, email, `can_receive`, and receiving readiness.
- `create_mailbox` — only when no suitable mailbox exists; one authorized create. Prefer:

```json
{
  "email": "signup-SERVICE@YOUR_DOMAIN_OR_MERMAIL",
  "name": "Signup OTP — SERVICE",
  "settings": {
    "agentInbox": {
      "mode": "verification",
      "automationsEnabled": false
    }
  }
}
```

Omit `settings.agentInbox` only if the live schema rejects it.

## Bounded mail reads

- `search_emails` — preferred poll. Example shape:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "subject": "verify",
    "date_start": "ISO-8601-START",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Adapt filters to the live schema. Always bound by sender domain allowlist, recipient, subject tokens, and start time.

- `list_emails` — newest-first fallback with the same bounds.
- `get_email` — metadata-only first; after **exactly one** candidate validates, fetch bounded clean content for OTP extraction.
- `get_email_context` — only after a single validated message; never to break ambiguity.

## Out of scope tools

Do not call compose/send, triage create/update, wallet/PayBox, Composio, or destructive deletes as part of this skill. Signup OTP watch is read + one optional mailbox provision + protected extraction + handoff.
