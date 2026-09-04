# Expense agent workflows

## One run, one window

1. Fix the search window from the user's request: exact dates, sender/domain hints, labels, folders, or attachment presence. State the window before the first read.
2. `search_emails` with `from`/`subject`/`date_start`/`date_end`/attachment filters; fall back to newest-first `list_emails` when filters are too narrow. Metadata only at this stage.
3. Select candidates: invoice/receipt subjects, billing senders, attachment presence. Post-check each candidate's mailbox, sender domain, and timestamp before body reads.
4. Fetch `get_email` for one candidate at a time. Require `scan_status: clean` and `sender_authentication.status: pass` before interpreting body text or attachments; keep anything else metadata-only and record it in the mismatch report.
5. Extract the fixed field set (vendor, dates, currency, subtotal, tax, total, payment hint, invoice/receipt number) with the `emailId` cited per figure. Amounts and currencies stay as printed; mark contradictions `unreadable` and flag the row.
6. Reconcile against user-supplied totals only: duplicates match on vendor + amount + date + invoice number; overcharges are exact comparisons with the user's figure. State the baseline used for every flag.
7. Preview the filing plan (labels, folder moves, log draft) with exact message IDs; after one approval, apply it as one batch of `create_custom_label` / `create_folder` / `move_email` / `save_draft`.
8. Disputes and corrections end as drafts: `save_draft` addressed to the vendor with the discrepancy quoted. Sending is `mermail-compose-email`'s external effect; never send inside this skill.
9. Close with the bounded-run summary and per-row terminal state. Do not loop or re-search a wider window without a fresh user request.

## Recurring log maintenance

1. Ask which mailbox and period the log covers; reuse the prior approved filing labels and log-draft pattern if the user confirms.
2. Search only the new period. Append rows; never rewrite verified historical rows from new evidence without flagging the change and citing the new `emailId`.
3. Keep one log per mailbox per period; a second overlapping log is a duplicate-workflow error, not a feature.

## Attachment receipts

1. Confirm the attachment belongs to the selected message (`attachmentId` from that email's metadata) before `download_attachment`.
2. The MCP bridge rejects binary responses over 1 MiB; report the limit for larger attachments instead of inventing another transport.
3. Extract figures only from text-legible content; scanned or illegible receipts are `unreadable` rows. OCR tooling is out of scope for this skill.

## Filing map

| Outcome | Real operation | Owner |
| --- | --- | --- |
| Log saved for review | `save_draft` to the user | `mermail-compose-email` |
| Vendor dispute / correction | `save_draft` to vendor | `mermail-compose-email` |
| File by vendor or period | `create_custom_label`, `create_folder`, `move_email` | `mermail-manage-inbox` |
| Raw table export | chat output, or `mermail-cli` when the user asks for shell/JSON | `mermail-cli` |

Filing moves, labels, and log drafts are internal writes batched under one approved preview. Anything leaving the workspace is an external effect and belongs to its owning skill.
