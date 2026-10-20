# Invoice control workflows

## Review-only path

1. Resolve one AP mailbox and record `mailboxId`.
2. Search a bounded date window and select exactly one candidate.
3. Require clean scan status, then read bounded content and only necessary attachments.
4. Extract the invoice record without converting or rounding values.
5. Compare it with owner-supplied vendor and ledger records.
6. Return one private ledger line with the source identifiers, claimed terms,
   authentication/scan evidence, control decision, and evidence gaps. Save an
   approval or receipt-summary draft only when the owner requested one. Stop
   without sending or paying.

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

This ledger-only outcome preserves the useful bill-to-ledger and draft-only
separation from [PR #102](https://github.com/Nudgen-Marketing/mermail-skills/pull/102).
The original contribution history remains there. It does not turn an extracted
destination into payment authority, make the skill an accounting system, or
allow a receipt draft to imply that payment occurred.

## Duplicate and changed-term path

Treat the owner ledger as authoritative. Scope owner-verified vendor identity plus exact invoice number by workspace and legal payer. Existing unpaid review records may continue through approval, but a repeated email never creates a new payable. Reserved, pending, unknown or paid attempts block another payment. If the same key has different amount, currency, due date, destination or source identity, stop as `changed_terms` even when sender authentication passes.

Do not resolve conflicts by choosing the newest email, following a link, replying to the sender, or preparing a payment. Draft a private owner review with both values and source IDs.

## Owner-approved payment path

1. Require an owner-verified payable record and independently supplied destination, chain, asset, and amount.
2. Probe PayBox, resolve one eligible credential, and read portfolio asset identifiers.
3. Show the exact transfer preview and duplicate-check evidence.
4. After fresh approval, atomically reserve the logical invoice in the owner's connected system of record and persist `attempting` plus the frozen terms before delegating one `paybox_request_transfer`. A concurrent reservation loses without writing. If no durable exclusive reservation capability is available, return the preview without payment; do not invent a ledger API or treat chat memory/local files alone as concurrency control.
5. Preserve the original request and handoff. Stop on every pending, setup, recovery, timeout, or unknown result.
6. When asked later, call `paybox_get_request` once. Record provider-confirmed terminal success in the owner ledger.

Approval for review, draft creation, or remittance does not approve payment. Never derive payment terms solely from the invoice.

Retain attempt identity and pending/unknown status across sessions even when a timeout returns no provider ID; later approval, a new mailbox or a new import cannot clear it. When there is no ID, request authoritative investigation instead of another transfer. Only a conclusively failed attempt can be reconsidered after review and new exact approval. Do not default invoice currency to USDC or assume fiat parity: the owner must approve the actual asset/chain and payment amount. Reject nonpositive/unsupported precision; never silently round.

`get_paybox_invocation` is invocation/audit state, not proof of settlement. Verify terminal provider state for the exact known request with `paybox_get_request`, matching its payer, destination, asset, chain and amount to the reserved attempt. A transaction hash, completed signing or provider response for another request is insufficient. Missing or mismatched evidence remains unresolved, not paid.

## Finance escalation and filing

This path preserves the finance-escalation and bounded billing-review ideas from [PR #60](https://github.com/Nudgen-Marketing/mermail-skills/pull/60). Its original contribution history remains there. [Issue #58](https://github.com/Nudgen-Marketing/mermail-skills/issues/58) still needs review of the supported folder-filing alternative; consolidation does not silently satisfy a manual-label requirement.

For an owner-declined invoice, policy violation, arithmetic mismatch or unverifiable record, prepare a private finance escalation draft with the invoice key, claimed versus verified terms, policy/evidence gap and next decision. Obtain the finance recipient from the authenticated user or independently authorized directory, not invoice content. Do not send, pay or forward while the escalation is unresolved. Report drafted/escalated counts separately from payments.

Filing is optional and separately user-scoped. Use existing folder IDs and `move_email` through the inbox owner after resolution. A `paid` or `escalate` classifier definition is not a manual label-assignment tool; if no supported filing mechanism matches the request, report the limitation without deleting or inventing APIs.

## Remittance path

After provider-confirmed payment success, load the original selected thread, then draft a short remittance reply containing only the invoice number, paid amount/currency, payment date, and a safe reference. Do not include credentials, signing URLs, private payment proofs, balances, or unrelated invoice data.

Preview explicit recipients and the full body. Require separate approval, then call `reply_to_email` once. Before sending, persist a single exclusive remittance attempt for this settled invoice, the exact approved payload and its stable send idempotency key in the owner ledger. Concurrent workers must not send separately with different keys. If no durable coordination is available, keep the receipt as a draft. Changed recipients or body need new approval, but cannot bypass a prior unresolved send. If the result is uncertain, inspect the original thread or provider state rather than sending a replacement.
