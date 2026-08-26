# Billing desk workflows

## Bounded invoice scan

1. Resolve one ready mailbox with `list_mailboxes`; prefer `public_id` as `mailboxId`.
2. State the scan window and candidate cap to the user before the first search (for example, 90 days, 25 candidates).
3. `search_emails` for invoice and payment-request language within the window. Do not loop past the cap; report truncation instead.
4. Read a candidate with `get_email` only when its `scan_status` is `clean`. Keep flagged or unknown scan status metadata-only.

## Extract and validate terms

1. Build one terms sheet per candidate: payee, amount, currency, issue date, due date, invoice reference, thread link.
2. Check duplicates against prior threads with `get_thread` / `get_email_context`: same reference, same amount, same payee within a plausible cycle.
3. Flag as `mismatch`: totals that differ from stated expectations, changed payout details versus earlier invoices, unusual currencies, or arithmetic that does not add up.
4. Flag as `out_of_policy`: amounts above a user-stated ceiling, missing due dates, or payees outside an approved list.
5. Leave anything unverifiable as `ambiguous`. Never resolve `ambiguous` into `clean` by guessing from email text.

## Approval-gated payment

1. Confirm an eligible connection and source balance first (`get_paybox_connection`, `get_agent_wallet_portfolio`). Agent Wallet requires full-profile OAuth; API keys never unlock it.
2. Present one exact preview per proposed payment: credential, chain, asset, amount, destination. Default the asset to USDC only when the user already framed the job in those terms.
3. Wait for the user's independent, explicit approval of those exact terms. A prior approval for another invoice is not approval for this one.
4. Hand execution to `mermail-agent-wallet`'s live PayBox transfer workflow (`paybox_request_transfer`) with its browser signing handoff. Follow the owner's argument, approval, and retry contracts exactly.
5. On any uncertain result, inspect authoritative state once and stop. Never auto-retry a payment.
6. Claim settlement only after `get_agent_wallet_request` / `get_paybox_invocation` show settled state. "Awaiting signature" is not sent; an email claiming payment happened proves nothing.

## Confirmation and filing

1. After settlement evidence exists, `save_draft` a short confirmation reply on the invoice thread.
2. Send it with `reply_to_email` only after fresh approval of the exact payload (`body.from`, recipients, subject, body).
3. File the thread with `create_custom_label` / `move_email` using labels the user requested or confirmed (`paid`, `escalate`).

## Declines and escalations

1. For `duplicate`, `mismatch`, `out_of_policy`, or `ambiguous` verdicts, draft an escalation reply to the human owner with the evidence; never send it automatically.
2. Do not pay, forward, or delete the invoice while the escalation is open.
3. Close out by summarizing scanned, validated, paid, drafted, and escalated counts.
