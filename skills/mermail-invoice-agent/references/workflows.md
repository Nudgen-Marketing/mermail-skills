# Invoice agent workflows

Four sequences: intake, register, chase, reconcile. Resolve the mailbox once and reuse the returned stable IDs across all of them. Read [security.md](security.md) first.

## 0. Mailbox and scope

1. `list_mailboxes` — pick one ready mailbox. Prefer `public_id` as `mailboxId`. Only when none fits and the user authorizes it, `create_mailbox` (requires `email` and `name`, consumes provision credits).
2. Ask once, in a single combined question, for anything missing:
   - the accounting period,
   - the currencies in scope,
   - the user's own legal entity name.
   The entity determines `direction` for every row. Do not infer it from a signature block, and do not proceed with a guess.
3. Agree a read cap. State it back before scanning.

## 1. Intake — find the billing mail

1. `search_emails` with a native JSON object query, bounded by the agreed date range and cap. Run a small number of distinct queries rather than one unbounded sweep: document terms (invoice, receipt, statement, remittance, credit note), known counterparty domains, and attachment-bearing mail in the period.
2. Keep results `metadata_only`. Classify from subject, sender, date, and attachment name.
3. Drop obvious non-billing mail before reading a single body. Marketing mail that says "invoice" in a subject line is not an invoice.
4. Check `scan_status`. Anything not `clean` becomes an `unreadable` metadata row and is not opened.
5. Report how many messages matched, how many you read, and where you stopped.

## 2. Register — extract each document

For each candidate, in order:

1. `get_email` (or `get_thread` when the document is mid-conversation).
2. `download_attachment` only if the document itself is attached. Unreadable or oversized attachment → `confidence: unreadable`, no inferred amount.
3. Extract: `direction`, counterparty, document number, currency, amount, issue date, due date, source email id, evidence.
4. Set `confidence`:
   - `extracted` — every required field found, body and attachment agree,
   - `partial` — a field is missing or the body and attachment disagree (record both values),
   - `unreadable` — the document could not be opened or parsed.
5. Set `unverified_payment_details` on any row containing bank, IBAN, wallet, or payment-portal details, or announcing a change of remittance details. Stop that row and follow the payment-detail rule in [security.md](security.md).
6. Never convert currencies. Never total across currencies.

Present the register most-urgent-first, with the flagged rows called out above the summary.

## 3. Chase — aged receivables

1. Age each receivable against today: current, 1–30, 31–60, 60+ days past due.
2. Confirm with the user which rows to chase. Do not chase every overdue row by default; a row already disputed or already paid outside the mailbox must not get a reminder.
3. `save_draft` one reminder per row: document number, amount and currency, issue date, due date, days overdue, and a single clear ask. Do not include bank details taken from inbound mail; use only details the user supplied in this session.
4. Preview recipients and body. On approval, exactly one write:
   - `reply_to_email` on the original thread when the thread exists and is the right context,
   - `forward_email` when escalating internally to a named human,
   - `schedule_email_send` for a dated future reminder, with the send time approved alongside the payload.
5. Set `body.from` to the mailbox email and pass `to`, `cc`, and `bcc` explicitly. MCP does not auto-fill Reply All; a silently dropped Cc on a dunning thread is a real failure.
6. On a recipient-limit rejection, preserve To/Cc/Bcc, surface the stable error and any `Retry-After`, and require fresh approval for any changed payload. Do not split recipients to evade the limit.
7. File the row: `create_custom_label` or `move_email` to an Awaiting Payment or Chased folder.

## 4. Reconcile — receipts against invoices

1. Match on document number first. Fall back to counterparty plus exact amount plus a date window only when no document number exists, and mark such matches ambiguous.
2. Cluster duplicates: same counterparty and same document number, or the same amount within a short window. Report the cluster; never delete one side of it on your own.
3. Report three buckets explicitly — matched, unmatched, ambiguous — with counts. Unmatched receipts and unmatched invoices are listed separately; they mean different things.
4. File matched rows to Paid via `create_custom_label` or `move_email`. Mermail stores no payment state; the label *is* the state.
5. Hand any row the user wants to pay to `mermail-agent-wallet` as a decision packet. This workflow does not pay.

## 5. Automation — recurring classification

1. `list_task_triagers` before creating anything.
2. `create_task_triager` / `update_task_triager` for classification and auto-draft only: label incoming billing mail, draft an acknowledgement, surface flagged payment-detail changes for human review.
3. `list_recent_triager_runs` before changing a failing triager.
4. A triager never sends, never chases, and never applies a payment decision. Do not call `set_default_task_triager`.

## Ordering rules

Bounded reads → internal reversible writes (label, move, draft) → external effects (send, schedule, forward) under their own exact approval → destructive operations last with `prepare_destructive_action`. Approval of an earlier step never authorizes a later one. If an earlier write returns an uncertain result, inspect authoritative state once and resolve the ambiguity before continuing into a dependent effect.
