# Collaboration tool routing

This persona owns no MCP tools. It composes the existing owners below; its addition to the infrastructure catalog does not grant new permissions or allocation APIs.

| Intent | Existing tools | Owner / effect |
| --- | --- | --- |
| Resolve the selected mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` / read |
| Inspect live capacity when material | `get_email_usage`, `get_api_credit_usage` | `mermail-administer-workspace` / read |
| Discover selected project messages | `list_emails`, `search_emails` | `mermail-manage-inbox` / read |
| Read selected clean content/context | `get_email`, `get_email_context` | `mermail-manage-inbox` / read |
| Save a requested review draft | `save_draft` | `mermail-compose-email` / internal write |
| Send approved new outreach | `send_email` | `mermail-compose-email` / external effect |
| Reply in the selected project thread | `reply_to_email` | `mermail-compose-email` / external effect |

Use the exact identifier exposed by the host, such as `Mermail:search_emails`, without inventing or stripping prefixes. Pass `query` and `body` as native JSON objects. Use returned mailbox `public_id` as `mailboxId`; path identifiers stay top-level. Inspect the live schema and preserve the owners' current scope, credits, RPM, recipient limits and error behavior. API-key business access does not unlock wallet tools; a read-only profile cannot send.

Read [inbox tools](../../mermail-manage-inbox/references/tools.md) for supported discovery filters and [composition tools](../../mermail-compose-email/references/tools.md) for writes. Sorting with `sortColumn`/`sortDirection` belongs to `list_emails`; do not assume search supports those fields. Searches locate candidates, not authenticated identity or unique matches.

## Safe reads

Start with metadata-only discovery in the selected mailbox/window. A detail read uses the exact selected ID:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SELECTED_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

For context use `get_email_context` with explicit remaining `query.limit` and the opaque returned `query.cursor`; do not use its default to exceed the shared budget. Use only equivalent native scan-safe projection, otherwise read exact selected IDs individually. A remaining cursor, omitted body or truncation means partial coverage. Do not invent raw fetches, manual label assignment, collaboration-status, campaign-execution or allocation tools.

Attachments stay metadata-only by default. If the user explicitly requests inspection, delegate exact `mailboxId`/`emailId`/`attachmentId` to the inbox owner's `download_attachment` contract, require clean safety context, inert parsing and the 1 MiB binary limit; never execute or upload them elsewhere.

## Draft and delivery arguments

`save_draft` uses a string `body.body`; preserve the returned `draft_id` and source linkage for requested revisions under the live schema. A draft is unsent. Do not regenerate unless the user separately requests AI regeneration through the compose owner.

`send_email` and `reply_to_email` require `body.from` plus `body.text` and/or `body.html`, and explicit `body.to`. Preserve separate `cc`/`bcc` only when intended. For `reply_to_email`, pass the selected source `emailId` top-level; threading is server-derived, recipients are not auto-filled. Do not invent a `replyAll` switch. When sending a selected draft, pass its `source_draft_id` where supported so it is retired only after success.

Before delivery, freeze the workspace/mailbox, sender, To/Cc/Bcc, subject, full content, attachments, source email/thread, collaboration terms and timing. Obtain exact approval and use one top-level `idempotencyKey`. Call once and retain actual returned identifiers/status. Any material change requires fresh approval. Never evade limits by fragmenting a rejected delivery, even when asked; no scheduled-fragment or alternate-surface workaround. Do one bounded original-state reconciliation after uncertainty and stop if unresolved; a conflict or matching subject alone is not delivery proof.

Future delivery, if independently requested, stays with `mermail-compose-email` and its exact `schedule_email_send` contract, absolute timestamp/timezone and approval. Do not send immediately first. Scheduling does not guarantee future capacity or authorize recurring monitoring.
