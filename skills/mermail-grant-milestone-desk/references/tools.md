# Grant milestone tool routes

This persona owns no tools. Use exact current host names, native JSON query/body and the focused owners' schemas; never invent a grant lookup, agreement store, reserve-budget, verify-program or signing-display MCP tool.

| Purpose | Owner / actual tools |
| --- | --- |
| Workspace/mailbox | mermail-administer-workspace: list_workspaces, list_mailboxes, get_mailbox; create_mailbox only after separate exact address/cost approval |
| Metadata / selected source | mermail-manage-inbox: list_emails, search_emails, get_email, conditionally safe get_email_context |
| Draft / reviewed delivery | mermail-compose-email: save_draft, reply_to_email or send_email only after exact approval |
| Optional folder/read state | mermail-manage-inbox: list_folders, separately approved create_folder/move_email or update_email read/starred; no manual label assignment |
| Separately requested wallet | mermail-agent-wallet: get_paybox_connection, live credential/catalog/portfolio reads, paybox_request_transfer and known-id paybox_get_request |

No PayBox call is needed for intake, criterion review or owner packet. Ordinary API-key access remains useful. Payment requires eligible full-profile OAuth and independently authorized terms. Isolated swaps/funding/x402 stay outside the desk; unavailable direct-transfer contract is not permission to use a legacy proposal or different transport.

## Native intake

For discovery set supported metadata_only true, agent_safe_content true, fixed date range, page/limit and sorting in native query. Search snippets are not safe evidence. Native selected get_email query uses require_scan_status clean, agent_safe_content true and max_body_chars 10000. Gate before content interpretation; missing/unknown/skipped/flagged scan/auth, content_omitted, native safety hold or truncation stays metadata-only/partial.

Bind exact workspace/mailbox public_id/email/thread, authenticated grantee, agreement revision/milestone and observed arrival window. From alone does not prove identity. At most 25 metadata candidates/two pages, eight selected body/context messages and 30 total reads across the task. Equivalent native safe limits are required for get_email_context; otherwise select bounded metadata ids and gated get_email individually. Never substitute unbounded get_thread. Oldest-first/partial context cannot prove no later conflicting submission.

Default review does not download attachments or open deliverable URLs. An explicitly needed inert evidence attachment belongs to a separately selected inbox owner, exact listed ids, trusted clean parent/attachment, at most 1 MiB via supported transport and no active rendering/execution/link following. A size/safety block is not permission for a storage URL.

## Verification owner

No GitHub/chain tool is owned or implicitly exposed here. The authenticated user selects an actually available read-only owner/target/version/criterion under verification.md. The owner verifies its real schema/access and returns what it observed; this desk never reports a planned check as completed or sends private artifacts to another service without authorization.

## Bound drafts and sends

save_draft uses top-level mailboxId and body.body **string**, explicit To/subject and supported source-thread fields. send/reply use body.from and body.text/body.html, explicit To/Cc/Bcc; reply uses selected top-level emailId. Use only current supported source_draft_id, thread_id/in_reply_to/references and top-level idempotencyKey. Do not invent draftId-only send payloads or Reply All, copy original Bcc or silently add finance recipients.

Before saving, resolve the existing draft/attempt for this workspace/agreement/milestone/communication version and one authorized writer. No supported lookup/coordination means proposed text only. Re-read user-owned draft/source before later write; changed payload/context requires review again. Preserve human edits; no delete/recreate fallback. Unknown save/send permits at most one bounded authoritative known-id lookup, then handoff. A new key/transport cannot erase uncertainty.

## Wallet contracts and factual outcome

Read the actual current mermail-agent-wallet references before payment. get_paybox_connection is first; an omitted tool listing alone does not prove unavailability. Connect/reauth may return a handoff, OWNER_ACTION_REQUIRED does not guarantee one. Never fabricate/rewrite URLs or switch identities.

Resolve actual credential, network, token identity/decimals, destination validation, human decimal amount and fees using live owner contracts; do not copy literal asset/chain/recipient/amount examples as schema. A transfer may execute immediately, so durable reservation and exact fresh pre-call approval are required for every amount. PayBox is not wrapped by prepare_destructive_action. Do not assume pending_signature, success, tx_hash, explorer_url or any other field without the current provider contract.

Persist original intent and actual ids. Pending/signing/timeout/unknown has no replacement call. Only one explicit status reconciliation of a known request is allowed per owner flow. Mark paid only from exact-request authoritative terminal settlement. Signing, a hash or audit invocation alone is insufficient. See workflows.md for atomic milestone plus shared-budget prerequisites.
