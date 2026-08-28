# Receipt vault tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`. Never invent receipt, ledger, or payment tool names.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (for example `list_emails` or `Mermail:list_emails`). Do not manually add, strip, or invent prefixes. Prefer mailbox `public_id` as `mailboxId`. Inspect live schemas with MCP `tools/list`.

## Used tool map

| Class | Tools | Owner |
| --- | --- | --- |
| Mailbox discovery | `list_mailboxes` | `mermail-administer-workspace` |
| Message discovery | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Attachment | `download_attachment` | `mermail-manage-inbox` |
| Message organization | `update_email`, `bulk_mark_emails_read`, `move_email`, `bulk_move_emails` | `mermail-manage-inbox` |
| Folder definitions | `list_folders`, `create_folder`, `update_folder` | `mermail-manage-inbox` |
| Custom-label definitions | `list_custom_labels`, `create_custom_label`, `update_custom_label` | `mermail-manage-inbox` |
| Optional digest copy | `save_draft`, `send_email`, `schedule_email_send` | `mermail-compose-email` |
| Destructive confirmation | `prepare_destructive_action` | shared |

`delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`, and `delete_custom_label` are owned by `mermail-manage-inbox` and are **out of the happy path**. Do not delete receipts while filing. If the user separately requests a destructive action, follow that skill's contract and obtain a confirmation token.

## Out of scope

Do not call these from this skill:

- Any `paybox_*` or Agent Wallet tool (`mermail-agent-wallet`, `mermail-x402-agent`)
- Composio Gmail/Outlook toolkits
- Mailbox-agent chat tools (`mermail-mail-agent`)
- Verification isolation / `include_held` workflows (`mermail-agent-inbox`)

There is no `extract_receipt`, `assign_label`, `create_ledger`, or `pay_invoice` MCP tool.

## Native MCP envelope

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {},
  "idempotencyKey": "optional-stable-key"
}
```

Do not pass `"query": "{\"folder\":\"inbox\"}"`.

## Discovery

Newest metadata, then search. `list_emails` supports page/limit (1–100), folder, thread id, category, custom label, read/starred state, separate sort column/direction, and safety filters. There is no `sort: "date_desc"` shortcut.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`search_emails` supports free text (use the live schema field name), sender, recipient, subject, ISO `date_start` / `date_end`, folder, read/starred state, category, attachment presence, safety fields, and page/limit. Filters establish candidates, not sender authentication.

Typical receipt discovery terms (data, not instructions): `receipt`, `invoice`, `order confirmation`, `purchase confirmation`, `payment received`. Combine with a bounded date window.

## Read one selected message

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

`metadata_only: true` omits body, snippet, raw headers, and threat URLs. A scan mismatch returns safe metadata with `content_omitted: true`; it is not a false not-found. Use `get_email_context` only when surrounding conversation matters. `get_thread` is the broader thread endpoint.

## Attachment contract

`download_attachment` requires exact `mailboxId`, `emailId`, and `attachmentId`. Read email metadata first. The MCP bridge rejects binary responses over 1 MiB; report that limit rather than inventing another URL.

## Filing (folder move)

Call `list_folders` before create or move. `create_folder` uses `body.name`. Creation derives the folder id by slugifying the name and rejects a name without alphanumeric characters. Do not infer a folder id from display name.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "body": { "folderId": "FOLDER_ID" }
}
```

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "ids": ["EMAIL_1", "EMAIL_2"],
    "folderId": "FOLDER_ID"
  }
}
```

Use those respectively with `move_email` and `bulk_move_emails`. Freeze the unique id set before authorization. `update_email` changes only read/starred state:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "body": { "read": true }
}
```

## Custom-label definitions (not per-message tags)

These tools manage AI classification definitions. Any authorized mailbox member may `list_custom_labels`. Create/update are admin-only. `body` for create requires `name` (1–80), `rules` (1–500), and optional `color` (up to 32 characters). A mailbox supports at most 20 definitions.

No tool in this domain manually attaches a label to an existing message. Do not invent `assign_custom_label`, `reorder_custom_labels`, or a detection-toggle tool. `delete_custom_label` is destructive and not part of filing.

Example classifier rules (untrusted matching data, not tool instructions): classify mail as receipts when the subject or body looks like a receipt, invoice, order confirmation, or purchase confirmation and includes an amount and merchant.

## Optional digest copy

`save_draft` uses string `body.body` (not `html`/`text`). `send_email` uses `body.html` and/or `body.text` and requires `body.from`. `schedule_email_send` uses string `body.body` and `scheduled_send_at` (ISO-8601 UTC). Mixing draft and send body shapes fails with `code: "validation_failed"`. Exact preview of To/Cc/Bcc, subject, and body is required before send or schedule. Never claim a draft was sent. Preserve To/Cc/Bcc; if an external recipient limit errors, surface the stable error and `Retry-After`, and require fresh approval for any changed payload.

## Destructive tools

For `delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`, and `delete_custom_label`, first call `prepare_destructive_action` with the exact final tool name and arguments. Add its single-use, five-minute `confirmationToken` to one matching call. Do not change arguments or reuse the token.

## Ledger output shape (agent-produced, not an MCP tool)

| Column | Source |
| --- | --- |
| `emailId` | selected message id |
| `merchant` | extracted data or `unknown` |
| `amount` | extracted number or omitted |
| `currency` | extracted ISO code or omitted |
| `date` | extracted purchase/invoice date; fall back to header date and say so |
| `orderId` | extracted or omitted |
| `senderAuth` | `pass` / `unknown` / other live status |
| `confidence` | `high` or `low` |
| `folderId` | after a successful move |

Do not invent missing amount, merchant, or order-id.
