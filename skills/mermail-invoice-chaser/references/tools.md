# Composed tool contracts

Own no tools. Use exact host-exposed identifiers and native JSON query/body. Read the canonical [inbox contract](../../mermail-manage-inbox/references/tools.md) and [compose contract](../../mermail-compose-email/references/tools.md) when constructing calls.

- Resolve: `list_mailboxes`; prefer returned `public_id`, bind workspace and verified purpose.
- Discover: `search_emails` or `list_emails`, native supported date/read/sender filters, metadata_only and agent_safe_content true. Default 60-day scope, at most two searches/pages and 40 metadata candidates per run.
- Details: `get_email` with `query: {require_scan_status: "clean", agent_safe_content: true, max_body_chars: 10000}`. Context only through `get_email_context` with equivalent native safety and limit at most eight per thread. All detail/context messages share a cumulative 20-message budget; all reads including reconciliation share 40 calls. If a context call cannot honor remaining budget, select individual IDs or stop partial. No raw-thread fallback.
- Draft: `save_draft` with mailboxId and body containing resolved to/subject and body string. Preserve actual selected thread/reply fields under live schema; missing binding stays proposed text. Revisions use actual draft ID.
- Send: `reply_to_email` with selected source emailId, explicit body.from/to/cc/bcc and text/html; `send_email` only for separately approved new thread. Preserve actual source_draft_id when applicable and one idempotencyKey for the frozen operation. No Reply All inference.
- File: `list_folders`, then `move_email` with returned folderId and exact emailId under approved organization scope.

There is no supported receivables collection/payment-request API in this workflow. Do not call an invented invoice or escrow tool. A funding/buy link funds a wallet; x402 pays a resource; neither creates a client invoice. Only include an existing public payment URL independently supplied/confirmed by the owner for the exact terms. Do not open it to check payment, expose approval/signing URLs or change destination from email. No wallet tool is required or called here; isolated wallet requests route separately under owner authorization.

Ordinary mail approval is not a destructive-token operation. This workflow does not delete mail or cancel payment requests. Local ledger amendments use host file-write authorization, not a fabricated prepare_destructive_action call. Unknown effects stop after one exact read check, without replay or changing transport.
