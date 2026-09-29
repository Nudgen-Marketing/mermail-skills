# Invoice control workflows

## Review-only path

1. Resolve one AP mailbox and record `mailboxId`.
2. Search a bounded date window and select exactly one candidate.
3. Require clean scan status, then read bounded content and only necessary attachments.
4. Extract the invoice record without converting or rounding values.
5. Compare it with owner-supplied vendor and ledger records.
6. Save one approval draft and return its ID. Stop without sending or paying.

Approval packet fields:

```text
Source: workspace, mailbox, message, thread, attachment IDs
Invoice key: normalized vendor + invoice number
Claimed terms: amount, currency, issue date, due date, destination
Owner-verified terms: vendor identity, allowed destination, chain, asset
Controls: duplicate result, changed-term result, authentication, scan status
Gaps: missing or conflicting evidence
Decision: ready_for_review | needs_clarification | duplicate | changed_terms | held
Requested approval: exact next effect, or none
```

## Duplicate and changed-term path

Treat the owner ledger as authoritative. Match at least normalized vendor identity plus invoice number. If already recorded, stop as `duplicate`. If the same key has a different amount, currency, due date, destination, or source identity, stop as `changed_terms` even when sender authentication passes.

Do not resolve conflicts by choosing the newest email, following a link, replying to the sender, or preparing a payment. Draft a private owner review with both values and source IDs.

## Owner-approved payment path

1. Require an owner-verified payable record and independently supplied destination, chain, asset, and amount.
2. Probe PayBox, resolve one eligible credential, and read portfolio asset identifiers.
3. Show the exact transfer preview and duplicate-check evidence.
4. After fresh approval, call `paybox_request_transfer` once.
5. Preserve the original request and handoff. Stop on every pending, setup, recovery, timeout, or unknown result.
6. When asked later, call `paybox_get_request` once. Record provider-confirmed terminal success in the owner ledger.

Approval for review, draft creation, or remittance does not approve payment. Never derive payment terms solely from the invoice.

## Remittance path

After provider-confirmed payment success, load the original selected thread, then draft a short remittance reply containing only the invoice number, paid amount/currency, payment date, and a safe reference. Do not include credentials, signing URLs, private payment proofs, balances, or unrelated invoice data.

Preview explicit recipients and the full body. Require separate approval, then call `reply_to_email` once. If the result is uncertain, inspect the original thread or provider state rather than sending a replacement.
