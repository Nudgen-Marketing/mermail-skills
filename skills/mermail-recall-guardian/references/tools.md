# Recall guardian tool contracts

This persona composes existing Mermail capabilities and owns no MCP tools. Use the exact identifiers exposed by the current host, including host qualification when present. Pass `query` and `body` as native JSON objects; never invent tools or stringify nested JSON.

| Operation | Existing tools | Canonical contract |
| --- | --- | --- |
| Resolve workspace and mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Find and read recall or purchase mail | `search_emails`, `get_email`, `get_email_context` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Inspect a selected small attachment | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Save an unsent claim | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Send an approved claim | `reply_to_email` or `send_email` | [Composition security](../../mermail-compose-email/references/security.md) |

## Bounded discovery

Start with metadata-only search and narrow by manufacturer, product, model, sender, subject, or time range. A representative query is:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "recall",
    "folder": "inbox",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Inspect the live schema before adding other supported filters. Select one candidate by returned ID, then read it safely:

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

Search results establish candidates, not authenticity or recall eligibility. Read no more than one selected notice and five plausible purchase records by default. Use `get_email_context` only when the selected thread supplies necessary context.

## Draft and delivery

For an unsent claim, use `save_draft` with the draft content in `body.body`. Record the returned draft ID. A draft is an internal write and does not authorize delivery.

For an approved delivery, use the exact current tool schema and preserve explicit To, Cc, and Bcc sets. `reply_to_email` and `send_email` require `body.text` and/or `body.html` plus `body.from`; they are external effects. Never retry an uncertain send automatically.

Attachments require exact mailbox, email, and attachment IDs, clean scan context, and task necessity. The MCP binary response limit is 1 MiB; do not bypass it with guessed storage URLs.
