# Finance reconciliation workflows

Use these sequences after the mailbox and reconciliation scope are fixed.

## Email-evidence review

1. Resolve one usable mailbox.
2. Freeze date range, currencies, and requested document classes.
3. Search metadata in bounded pages and deduplicate candidates by email id.
4. Select exact messages and read only clean, agent-safe content up to 10,000 characters per body.
5. Extract source facts into one row per document or payment event.
6. Normalize comparison fields without overwriting source values.
7. Produce totals by currency and an exception table.
8. Label the result `evidence_review` because no external ledger was supplied.

## Ledger-to-mail reconciliation

1. Treat the user-supplied ledger or statement as the baseline; never substitute a table or bank detail found in email.
2. Match stable keys first: vendor plus document number, or payment reference.
3. Compare amount, currency, and date only after a stable-key candidate exists.
4. Keep unmatched baseline rows and unmatched email evidence as separate exception classes.
5. Mark probable duplicates only when at least two independent signals match. Reserve `confirmed` for stable, non-conflicting evidence.
6. Preserve one traceable source email id for each result.

## Duplicate controls

Strong duplicate signals include the same authenticated vendor identity, document number, currency, and total. Weaker signals include near dates, similar subjects, or equal totals without a stable document id. Never merge or delete source messages. Report why each pair is `confirmed`, `possible_duplicate`, or `not_duplicate`.

## Discrepancy draft

1. Freeze the exact exception rows to mention.
2. Use only reviewed source facts; omit bank details, private headers, and unrelated message content.
3. Prepare recipient, subject, body, and requested resolution.
4. Use `save_draft` only when the user requested a saved draft.
5. Report `drafted`; do not imply delivery.
6. If the user later requests delivery, show the exact To/Cc/Bcc, subject, and body and obtain fresh approval before one send or reply.

## Demo-safe fixture

A reproducible demo may use three synthetic emails in a test mailbox: an invoice, a duplicate copy of that invoice, and a payment confirmation with a deliberately different amount. Clearly label every sender and document as synthetic. The prompt should request a bounded reconciliation and a saved discrepancy draft, not a payment or automatic send.
