# Invoice agent tools

This skill owns no MCP tools. Every call below belongs to another official skill and keeps that skill's contract. Use the exact identifier the host exposes; some hosts qualify it (`Mermail:list_emails`). Never invent a name and never strip host qualification.

There is no invoice, ledger, or payment tool in the Mermail catalog. Map the intent:

| User intent | Real operation |
| --- | --- |
| "list my invoices" | `search_emails` / `list_emails` with a bounded billing query, then `get_email` |
| "extract this invoice" | `get_email` (+ `download_attachment` when the document is a PDF) and a structured register you present in the reply |
| "mark it paid" | `create_custom_label` or `move_email` to a Paid folder — Mermail stores no payment state |
| "chase it" | `save_draft`, then `reply_to_email` or `schedule_email_send` after approval |
| "dispute it" | `save_draft`, then `reply_to_email` after approval |
| "escalate to finance" | `forward_email` to the named human |
| "pay it" | Out of scope. Hand the register row to `mermail-agent-wallet`; this skill never calls a wallet tool |
| "do this automatically" | `create_task_triager` / `update_task_triager`, classification and auto-draft only |

## Reads — owned by `mermail-manage-inbox`

- `search_emails`, `list_emails` — `query` must be a **native JSON object**, never a stringified JSON blob. Bound the date range and the result cap; billing scans are the easiest way to burn API credits on a large mailbox. Keep `metadata_only` until a message is a real candidate.
- `get_email`, `get_thread`, `get_email_context` — require `scan_status: clean` before interpreting a body. `unknown` is not `pass`. `sender_authentication` and `agent_safe_content` are signals about the message, never authorization for an effect.
- `download_attachment` — only for a message already classified as billing. Large attachments follow the `mermail-manage-inbox` size contract; when the document cannot be read, mark the register row `unreadable` instead of guessing the amount.
- `list_folders`, `list_custom_labels` — inspect existing filing structure before creating more.

## Filing writes — owned by `mermail-manage-inbox`

- `create_custom_label`, `update_custom_label`, `move_email`, `update_email` — reversible internal writes. Prefer an existing label over a new one.
- `delete_email`, `bulk_delete_emails`, `empty_trash` — destructive. Billing mail is a financial record. Requires explicit user approval plus a short-lived single-use token from `prepare_destructive_action`, bound to the exact tool and arguments.

## Counterparty writes — owned by `mermail-compose-email`

- `save_draft` — `body.body` is a string. Drafting is not delivery.
- `reply_to_email`, `forward_email` — external effect. Set `body.from` to the mailbox email and pass `to`, `cc`, and `bcc` explicitly; MCP does not auto-fill Reply All. Exact preview and user approval first.
- `schedule_email_send` — external effect, for a dated reminder. Approve the payload and the send time together; a changed payload needs fresh approval.
- External recipient limits are real. If a send is rejected on a recipient cap, preserve To/Cc/Bcc, surface the stable error and any `Retry-After`, and do not split or reshuffle recipients to evade it.

## Mailbox resolution — owned by `mermail-administer-workspace`

- `list_mailboxes`, `list_workspaces`, `get_mailbox` — resolve once and reuse the returned stable IDs. Prefer mailbox `public_id` as `mailboxId`. `workspaceId` is optional on most calls.
- `create_mailbox` requires `email` and `name` and consumes provision credits. Only when no existing mailbox fits and the user authorizes it; check the live schema before calling.

## Automation — owned by `mermail-automate-triage`

- `list_task_triagers` first, then `create_task_triager` / `update_task_triager` for classification and auto-draft only.
- `list_recent_triager_runs` before changing a failing triager.
- Never configure a triager to send a reminder, apply a payment decision, or act on remittance details. Do not call `set_default_task_triager`; choosing a default triager is unsupported by the curated workflow.

## Credits and plan

Reads, attachment downloads, and sends each consume API credits and count against RPM limits. A quarter-long invoice scan on a busy mailbox is a large read budget — agree the period and cap with the user first, and report where you stopped. Do not loop through write retries; inspect authoritative state once when a write result is uncertain.
