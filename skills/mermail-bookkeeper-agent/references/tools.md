# Bookkeeper tool contracts

This persona composes existing capabilities. It adds no ledger service, accounting API, bank feed, OCR pipeline, or storage system to Mermail, and it owns no tools. The ledger lives in the agent's responses and approved drafts; do not invent a Mermail tool named `create_ledger_entry` or call an external accounting host.

Pass `query` and `body` as **native JSON objects**. Never stringify them. Use the exact host identifier (`list_mailboxes` or `Mermail:list_mailboxes`). Prefer mailbox `public_id` as `mailboxId`.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace/mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Period capture and bounded reads | `search_emails`, `list_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Summary drafting and approved delivery | `save_draft`, `send_email` | [Composition tools](../../mermail-compose-email/references/tools.md) |

## Capture

- Full-profile Mermail access is required: the restricted agent-inbox profile cannot run the arbitrary searches this workflow needs.
- `search_emails` with sender/recipient/subject/`date_start` bounds first; fall back to newest-first `list_emails`. Keep every pass bounded and count retries inside the same deadline. Request `metadata_only` and `agent_safe_content` fields when the live schema exposes them.
- Validate before interpretation: expected mailbox, sender allowlist or verified registrable domain, `scan_status: clean`, in-period timestamp. Metadata-only treatment for anything flagged, skipped, unknown, or missing scan state.
- `get_email_context` only after a message is selected and only as far as the period or thread requires; never use thread context to decide an amount.

## Ledger

- Per-entry evidence: mailbox, `messageId`, sender address, `scan_status`, in-period date, document number if stated.
- Idempotency by (message ID, document number). Duplicates are reported; corrected documents create a superseding entry with both retained.
- Amounts, currencies, and tax lines are document-stated facts only. No conversion, no computation, no inference.

## Draft and delivery

- Draft content is the string `body.body` for `save_draft`; send content is `body.html` and/or `body.text` with required `body.from` for `send_email`.
- One idempotency key per approved send (`bookkeeper-summary-{period}-{recipient-domain}` pattern). Preserve To/Cc/Bcc exactly as approved. Do not invent recipients.
- Attachments only when the live send schema supports them and the owner approved the exact attachment; otherwise keep summaries in-body and bounded.

## Forbidden surfaces

- No `prepare_destructive_action`, no `delete_email`/`bulk_delete_emails`/`empty_trash`, no folder or label writes on source messages.
- No `paybox_*`, `paybox_pay_x402`, `paybox_request_transfer`, or `paybox_request_swap`; this persona never pays.
- No Composio connectors, no external accounting/SaaS exports, no host HTTP calls.
