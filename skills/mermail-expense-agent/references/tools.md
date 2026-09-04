# Expense agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `extract`, `ocr`, `export`, `log_expense`, or `accounting` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find the mailbox | `list_workspaces`, `list_mailboxes` | `mermail-administer-workspace` |
| Find receipt/invoice mail | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read one receipt | `get_email`, `get_thread` | `mermail-manage-inbox` |
| Pull a receipt PDF/image | `download_attachment` (≤ 1 MiB via MCP) | `mermail-manage-inbox` |
| File by vendor or period | `create_custom_label`, `create_folder`, `move_email` | `mermail-manage-inbox` |
| Save the log / dispute draft | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send a dispute (rare) | `reply_to_email` or `send_email` | `mermail-compose-email` |
| Deterministic export to files | CLI composition (`Mermail:list_emails` and similar) | `mermail-cli` |

## Read discipline

- Search metadata first; `get_email` only for one candidate at a time with `scan_status: clean` and `sender_authentication.status: pass`.
- Request `metadata_only` / `agent_safe_content` when exposed; cap pages and stay inside the declared window.
- `download_attachment` requires exact `mailboxId`, `emailId`, and `attachmentId` from that message's metadata; the bridge rejects binary responses over 1 MiB.

## Extraction fields (fixed set)

`vendor`, `transaction_date`, `currency`, `subtotal`, `tax`, `total`, `payment_hint`, `invoice_number` — each cited by `emailId` (plus `attachmentId` when from an attachment). Anything outside this set (line items, loyalty points, shipping) is optional context, never a reconciliation input.

## Example searches

```json
{ "query": { "from": "receipts@vendor.example", "date_start": "2026-09-01", "date_end": "2026-09-30", "has_attachment": true, "limit": 20 } }
```

```json
{ "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "emailId": "msg_123", "attachmentId": "att_1" }
```

## Example log draft body

```text
Expense log — September 2026 (mailbox receipts@…, window 09-01..09-30)

date       | vendor        | currency | total | tax | invoice | emailId | status
2026-09-03 | Vendor A      | USD      | 49.00 | 0   | 4471    | msg_101 | logged
2026-09-09 | Vendor B      | EUR      | 12.50 | 2.00| unreadable | msg_114 | flagged: tax mismatch
2 duplicates, 0 unreadable, 0 skipped.
```
