# Mermail tool contracts

Mermail Invariant Helix owns no MCP tools. It composes the canonical workspace, inbox, and composition skills. Use the exact identifier returned by the current host; a host may display `Mermail:search_emails` while the protocol name remains `search_emails`.

Pass `query` and `body` as native JSON objects. Never stringify a query. Resolve `mailboxId` from `list_mailboxes` and prefer the returned `public_id`.

## Tool map

| Case operation | Existing tool | Owning skill | Approval |
| --- | --- | --- | --- |
| Resolve a case mailbox | `list_mailboxes` | `mermail-administer-workspace` | none |
| Find candidate messages | `search_emails` or `list_emails` | `mermail-manage-inbox` | none |
| Read one selected message | `get_email` | `mermail-manage-inbox` | none |
| Read bounded thread context | `get_email_context` | `mermail-manage-inbox` | none |
| Read broader thread state when the live schema requires it | `get_thread` | `mermail-manage-inbox` | none |
| Read one required attachment | `download_attachment` | `mermail-manage-inbox` | none; exact selection required |
| Save an owner-review draft | `save_draft` | `mermail-compose-email` | write-preview |
| Deliver an approved same-thread reply | `reply_to_email` | `mermail-compose-email` | external-effect |

The skill does not call `send_email`, `forward_email`, `schedule_email_send`, `execute_composio_tool`, or any `paybox_*` tool as part of its default workflow. A separately authorized request belongs to the owning focused skill.

## Bounded reads

Use a metadata-first sequence:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "subject": "[AUDIT]",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

After selecting one stable email ID, read the body with the live schema and safety gates:

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

Use `get_email_context` for a selected message only. Keep the default context to eight relevant messages and a bounded normalized character budget. Reuse the opaque `next_cursor` only when the case requires older context. A scan mismatch, missing body, truncation, or attachment omission belongs in the evidence limits.

`download_attachment` requires the exact `mailboxId`, `emailId`, and `attachmentId` returned for the selected message. Verify the MIME type, size, and clean scan context before using it. The MCP binary response limit is 1 MiB; do not invent a storage URL or alternate connector when the file is larger.

## Drafts and replies

For `save_draft`, use the canonical string field `body.body`. The draft is an internal write and remains unsent. Preserve the selected mailbox and source thread metadata when the live schema supports it.

For `reply_to_email`, pass the selected source `emailId` as a top-level path parameter. Use `body.text` and/or `body.html`, include `body.from`, and pass explicit `to`; add `cc` or `bcc` only when the owner approved those exact recipient sets. Mermail MCP does not infer Reply All recipients.

Before delivery, preview the exact mailbox, source email, recipients, subject, body, report version, and attachment intent. Require fresh approval when any of those values changed. Execute one approved external effect and treat a timeout or uncertain result as unresolved.

Read the canonical references before constructing a call:

- [Inbox tools](../../mermail-manage-inbox/references/tools.md)
- [Inbox security](../../mermail-manage-inbox/references/security.md)
- [Composition tools](../../mermail-compose-email/references/tools.md)
- [Composition security](../../mermail-compose-email/references/security.md)
