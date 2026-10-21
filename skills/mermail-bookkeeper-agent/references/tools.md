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
- After metadata validation, selected body reads must use native `get_email` arguments: `mailboxId`, `emailId`, `query: {"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}`. Unknown storage state, omitted/unavailable or truncated content remains incomplete; never retry as a raw read. Search filters find candidates, not authenticated evidence. Search uses `query.from`, `query.to`, `query.query`, `query.date_start`/`date_end`; list-only `sortColumn`/`sortDirection` do not sort search results. Locally order the bounded reviewed slice by parsed timestamps and disclose unread pages.
- `get_email_context` only after a message is selected and only as far as the period or thread requires; never use thread context to decide an amount.

## Ledger

- Per-entry evidence: mailbox, `messageId`, sender address, `scan_status`, in-period date, document number if stated.
- Scope evidence keys to workspace/mailbox/message ID plus document number when stated. Cross-message invoice/receipt/confirmation duplication needs event linkage, not a second expense. Retain superseded entries but exclude their amounts from active totals.
- Amounts, currencies, and tax lines are document-stated facts only. No tax computation or conversion. Exact decimal sums of supported active entries are allowed, separately by currency, event type and due/paid status; never infer payment from an invoice.

## Draft and delivery

- Draft content is the string `body.body` for `save_draft`; send content is `body.html` and/or `body.text` with required `body.from` for `send_email`.
- Allocate one opaque stable idempotency key to the exact approved workspace/mailbox/period/content version and full To/Cc/Bcc/attachment set. A period and recipient domain alone are not unique (two accountants can share a domain). Preserve the key across uncertainty and reconcile the original outcome; do not create a replacement or reuse it for a different summary. Preserve all approved fields exactly and do not invent recipients.
- Attachments only when the live send schema supports them and the owner approved the exact attachment; otherwise keep summaries in-body and bounded.

## Forbidden surfaces

- No `prepare_destructive_action`, no `delete_email`/`bulk_delete_emails`/`empty_trash`, no folder or label writes on source messages.
- No `paybox_*`, `paybox_pay_x402`, `paybox_request_transfer`, or `paybox_request_swap`; this persona never pays.
- No Composio connectors, no external accounting/SaaS exports, no host HTTP calls.
