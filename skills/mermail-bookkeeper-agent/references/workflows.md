# Bookkeeper workflows

Use the section matching the owner's current intent. A captured entry is not a reconciliation, a draft is not a send, and this month's approval is not next month's.

## 1. Period capture

1. Confirm the `mermail` MCP connection and resolve workspace + bookkeeping mailbox with `list_workspaces` and `list_mailboxes`. Reuse the owner-named mailbox; do not create one without explicit authorization.
2. Fix the accounting period and owner-known timezone; ask when absent. Load the prior evidence index or state that no prior ledger was supplied. A newest-message cursor alone cannot prove historical capture.
3. Capture candidates with `search_emails` (sender/subject/date bounds) and newest-first `list_emails` fallback. Bounded passes only; record truncation.
4. Validate each candidate per [security.md](security.md): mailbox, sender allowlist/authentication, `scan_status: clean`, in-period timestamp.
5. Extract document-stated facts only (total, currency, shown tax lines, document number, counterparty, date). Derive provisional category from the owner's stated chart of accounts or the minimal fixed set.
6. Follow the primary workflow's workspace/mailbox evidence keys and event linkage. Invoice/receipt/confirmation records may concern the same obligation; do not count all as expenses. Retain superseded versions but exclude them from active totals; ambiguous duplicates remain exceptions.

## 2. Reconciliation prep

1. Require owner-supplied statement lines with currency, amount, date, account/direction and available counterparty/reference. Missing identity or currency is incomplete. The persona never connects a bank feed and never calls wallet or PayBox tools.
2. Match exact currency, amount and compatible account/direction plus supported counterparty/reference; date proximity is supporting evidence only. Each statement event can be allocated once. Multiple candidates and split/multi-document allocations remain ambiguous for owner review, never first-match wins. Output matched, unmatched ledger entries and unmatched statement lines.
3. Flag suspected duplicates and near-matches as ambiguous with both evidence trails. Never edit amounts to force a match, never delete "duplicate" mail, never mark anything paid.

## 3. Month-end summary draft

1. Sum active supported entries with exact decimal arithmetic, separately by currency and event/status; keep due invoices, paid expenses and refunds distinct. Include entry counts and actual reviewed coverage, not an assertion of whole-period completeness.
2. Compose the summary: totals table, exceptions (quarantined mail, duplicates, missing receipts), evidence index (subject, date, sender, message ID). Keep it bounded; no attachment bodies, no OTPs, no full document text.
3. Save only when requested by the owner and the exact mailbox/recipient set is resolved, using the composition owner's schema. Otherwise return an unsaved chat draft. Preview the complete body, From, To/Cc/Bcc and attachments in the response.
4. Stop for owner review. Never send from this workflow without the fresh, exact-preview approval in workflow 4.

## 4. Approved delivery

1. Owner approves the exact preview: body, from mailbox, recipients. Anything edited means a new preview.
2. One `send_email` with one opaque idempotency key bound to the exact approved workspace/mailbox/period/content version and full recipient/attachment set. Keep that key and reconcile the original result after uncertainty; no replacement sends or recipient-domain-only keys.
3. Record the send (message ID, timestamp) in the completion report, separate from ledger state.

## 5. Standing monthly run

- Repeat 1 → 3 each period; deliver per 4 only on fresh approval each time.
- Keep the standing chart of accounts, mailbox choice, and recipient list in owner-provided records. Do not persist them in this skills package.
- Skills alone do not make this an unattended accounting service; the owner reviews every summary before it leaves the mailbox.
