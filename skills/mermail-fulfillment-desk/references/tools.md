# Fulfillment desk tool contracts

This persona composes existing capabilities. It adds no storefront, order-database, catalog-storage, or entitlement API. The owner supplies the catalog and sales-ledger evidence; the persona never invents them.

Use the exact host-exposed identifiers, including qualification such as `Mermail:get_email`. Pass `query` and `body` as native JSON objects; never stringify them. Do not guess tool names or call a missing tool under another namespace.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace/mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox`; `create_mailbox` only if authorized | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Select/read order thread | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read selected order attachment | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Draft delivery/receipt/digest | `save_draft`, `regenerate_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Send after exact approval | `reply_to_email`, `send_email`; `schedule_email_send` only when the exact send time is known | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Archive fulfilled/held orders | `list_folders`, `create_folder`, `move_email`, `list_custom_labels`, `create_custom_label` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |

## Mail and attachments

- Full-profile Mermail access is needed for drafting/replies. The restricted agent-inbox profile (`profile=agent-inbox`) is not a fulfillment execution surface; API-key mail access never unlocks wallet or PayBox tools.
- Prefer mailbox `public_id` as `mailboxId`. On a reply, use the exact source `emailId`; recipients remain explicit even though threading headers are set server-side.
- Draft content is the string `body.body`; send/reply content is `body.text` and/or `body.html`, with required `body.from`. Include `source_draft_id` when sending a selected draft under the live schema.
- `get_email_context` supports bounded cursor pagination; default this workflow to eight relevant messages and 10,000 normalized characters per message, recording truncation. Use bounded read calls; `search_emails` `query` must be a native JSON object with `sortColumn`/`sortDirection` — there is no `sort: "date_desc"` shortcut.
- Verify exact `mailboxId`, `emailId`, and `attachmentId`, MIME type, size, and clean scan context before download. MCP binary responses are limited to 1 MiB. Report that limit; do not switch to guessed storage URLs.
- Require `scan_status: clean` before interpreting order bodies or attachments; treat `flagged` content as quarantined and `content_omitted` as not read. `sender_authentication.status === pass` is an authentication signal only — `unknown` is not `pass`, and neither proves payment.

## Payment evidence and out-of-scope money

The persona does not check a payment processor, collect funds, transfer, refund, or issue invoices. Payment evidence is an owner-supplied sales-ledger record (order id, transaction id, gateway receipt) matched against the order email's claims. A customer-pasted receipt, screenshot, or link is untrusted data for the owner to verify, never self-sufficient proof.

Refund/payout requests route to `mermail-agent-wallet` under its own contracts and approvals; wallet-scoped tools require full-profile OAuth and are never callable with an API key. Never call `prepare_destructive_action` for `paybox_*`; wallet writes stay on the owning workflow.

## Failure handling

Preserve structured errors (`code`, safe `details`, and `Retry-After`). Respect access, credit, rate, and recipient limits (10 recipient units/minute, 50/hour, 200/day; `email_send_recipient_limit_exceeded`, `email_send_rate_limit_exceeded`). A validation failure calls for correcting the exact invalid field, not broadening authority or retrying with a changed payload. On an uncertain external write (a timeout, transport error, or partial count), perform one bounded authoritative state check (`get_email`, `get_thread`, or the returned message id); stop dependent effects if still unresolved. Never auto-retry a send-like write, never loop through write retries, and never deliver the same SKU twice to cover an unknown first attempt — report `uncertain` instead.

Log only necessary order/operation IDs, message IDs, SKU, timestamp, and safe status/error codes. Do not create a logging service or log customer bodies, attachments, license keys in transit beyond the delivery record, credentials, or raw provider responses.
