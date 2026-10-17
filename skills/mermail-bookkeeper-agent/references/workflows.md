# Bookkeeper workflows

Use the section matching the owner's current intent. A captured entry is not a reconciliation, a draft is not a send, and this month's approval is not next month's.

## 1. Period capture

1. Confirm the `mermail` MCP connection and resolve workspace + bookkeeping mailbox with `list_workspaces` and `list_mailboxes`. Reuse the owner-named mailbox; do not create one without explicit authorization.
2. Fix the accounting period (default: current calendar month in the mailbox's timezone). Baseline the period: note the newest message ID already reflected in the ledger.
3. Capture candidates with `search_emails` (sender/subject/date bounds) and newest-first `list_emails` fallback. Bounded passes only; record truncation.
4. Validate each candidate per [security.md](security.md): mailbox, sender allowlist/authentication, `scan_status: clean`, in-period timestamp.
5. Extract document-stated facts only (total, currency, shown tax lines, document number, counterparty, date). Derive provisional category from the owner's stated chart of accounts or the minimal fixed set.
6. Append ledger entries with per-entry evidence and (message ID, document number) idempotency. Report duplicates; never merge.

## 2. Reconciliation prep

1. Require owner-supplied statement lines (amount, date, counterparty). The persona never connects a bank feed and never calls wallet or PayBox tools.
2. Pair by exact amount first, then date proximity within the period. Output three lists: matched, unmatched ledger entries (missing statement line), and unmatched statement lines (missing receipt).
3. Flag suspected duplicates and near-matches as ambiguous with both evidence trails. Never edit amounts to force a match, never delete "duplicate" mail, never mark anything paid.

## 3. Month-end summary draft

1. Compute per-category totals from captured entries only, with entry counts and first/last message examined.
2. Compose the summary: totals table, exceptions (quarantined mail, duplicates, missing receipts), evidence index (subject, date, sender, message ID). Keep it bounded; no attachment bodies, no OTPs, no full document text.
3. `save_draft` to the bookkeeping mailbox's Drafts. Always permitted. Preview the complete draft in the response.
4. Stop for owner review. Never send from this workflow without the fresh, exact-preview approval in workflow 4.

## 4. Approved delivery

1. Owner approves the exact preview: body, from mailbox, recipients. Anything edited means a new preview.
2. One `send_email` with one idempotency key (`bookkeeper-summary-{period}-{recipient-domain}`). No follow-on sends, no retries on uncertainty — report and stop.
3. Record the send (message ID, timestamp) in the completion report, separate from ledger state.

## 5. Standing monthly run

- Repeat 1 → 3 each period; deliver per 4 only on fresh approval each time.
- Keep the standing chart of accounts, mailbox choice, and recipient list in owner-provided records. Do not persist them in this skills package.
- Skills alone do not make this an unattended accounting service; the owner reviews every summary before it leaves the mailbox.
