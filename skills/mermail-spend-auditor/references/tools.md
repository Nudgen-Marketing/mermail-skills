# Spend auditor tool contracts

This persona composes existing capabilities and owns no Mermail tool. It adds no ledger database, background worker, or payment capability. The ledger lives in the conversation (and in a file only if the host provides file tools and the user asks for one).

Use the exact host-exposed identifiers, including qualification such as `Mermail:search_emails`. Pass `query` and `body` as native JSON objects. Read each tool's live schema before first use; field names below describe intent, and the live schema wins.

| Step | Tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace and mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Find candidate receipts | `search_emails`, `list_emails` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read one receipt | `get_email`, and `get_email_context` only for one ambiguous message | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Organize (optional, approved) | `create_folder`, `bulk_move_emails` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Draft (optional, approved) | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Digest (optional, approved external effect) | `send_email` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Wallet cross-check (optional, read-only) | `get_paybox_connection`, `paybox_get_portfolio`, `paybox_get_request` | [Wallet skill](../../mermail-agent-wallet/SKILL.md) |

## Bounded reads

- Default budget: 100 messages per audit, pages of 25. Record the number of matches left unread and say so.
- Collection pass: `metadata_only: true`, `require_scan_status: "clean"`, `agent_safe_content: true`, newest first with `sortColumn: "date"` and `sortDirection: "DESC"`. Keep the Mermail email `id` values; do not use provider or RFC `message_id` values as identifiers.
- Search filters such as `from`, `to`, and `subject` use substring matching. They find candidates; they do not prove who sent a message.
- Read pass: one `get_email` per candidate with `agent_safe_content: true`, `require_scan_status: "clean"`, and `max_body_chars` (default 6000). A response with `content_omitted: true` is `unread_unscanned`. A response with `content_truncated: true` lowers the row's confidence and is reported.
- `get_email` is read-only and does not mark mail read. This audit does not change read state.
- Attachments: this skill does not download attachments. Report `attachment_count` when present. MCP binary responses are capped at 1 MiB, and an attached PDF invoice is outside the default audit.

## Writes

- `create_folder` then `bulk_move_emails`: reversible internal writes. Preview the exact folder name and the exact Mermail email ids. Run `list_folders` first and reuse an existing folder rather than creating a duplicate.
- `save_draft`: content is the string `body.body`; do not use `html` or `text` for drafts. Address the draft only to a vendor address the user typed or confirmed.
- `send_email`: content is `body.text` and/or `body.html` with required `body.from`. One user-typed recipient. Preview first. Do not retry on `429`, `email_send_rate_limit_exceeded`, or `503 email_send_rate_limit_unavailable`; surface `Retry-After` and stop.
- Use `idempotencyKey` for a repeated create or move with identical intent. It is not proof of exactly-once execution; after an uncertain result, list state once before deciding.
- This skill never uses `delete_email`, `bulk_delete_emails`, `empty_trash`, `forward_email`, or `reply_to_email`, so it never needs `prepare_destructive_action`.

## Wallet cross-check

- Requires the full-profile OAuth session. API keys and the `agent-inbox` profile never expose PayBox, and this skill must not claim otherwise. Without PayBox, finish the email-only audit and say the wallet check was skipped.
- Call `get_paybox_connection` once, as the first wallet action, even if the host's `tools/list` omitted `paybox_*`. Reconnect only if that call itself fails with unknown-tool, method-not-found, or a hard error. For `connect_handoff`, `reauth_handoff`, or `OWNER_ACTION_REQUIRED`, relay the single returned instruction and continue the email-only audit.
- Use only fields the live read schemas return. If no payment history is returned, report `wallet_history_unavailable`.
- Treat any `x_payment`, credential, or signing value as sensitive: never quote, log, or store it.
- Forbidden from this skill: `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `paybox_get_buy_link`, bridge tools, and every legacy wallet proposal or submit tool.

## Failure handling

Preserve structured errors (`code`, safe `details`, `Retry-After`). A `validation_failed` response names the exact field to correct; fix that field instead of broadening scope. Respect plan, credit, rate, and recipient limits. If a write has an uncertain result, do one bounded authoritative read and stop dependent steps until it is resolved.
