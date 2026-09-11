# Workflows for Mermail Invoice Agent

## Workflow 1: Invoice Discovery & Extraction
1. Operator invokes agent: "Scan unread invoices in Finance mailbox".
2. Agent queries `search_emails` with query `is:unread invoice`.
3. Agent reads target email with `get_email` and reads bounded context via `get_email_context`.
4. Agent parses line items, total amount, currency, due date, invoice ID, and payout address into a structured record.

## Workflow 2: Balance Check & Proposal Generation
1. Agent queries `paybox_get_portfolio` or `get_agent_wallet_portfolio`.
2. Compares available balance against requested payment amount + network fee buffer.
3. If balance is sufficient, freeze the recipient, chain, asset/token address and decimals, amount, fee headroom, and vendor-verification evidence.
4. Present that exact transfer preview. An invoice or configured limit is not payment authorization; obtain fresh operator approval unless the current authenticated instruction already covers every frozen term.
5. If balance is insufficient:
   - Mark as `insufficient_funds` and report the exact top-up required. Funding does not authorize payment.

## Workflow 3: Execution & Vendor Receipt
1. For an ordinary transfer, invoke `paybox_request_transfer` once using only its live-schema fields. Do not create a legacy proposal first and do not fall back to one if the PayBox tool is missing.
2. For x402, first freeze the exact origin, resource/action, live quote, any same-origin prepaid floor, required charge, and maximum spend. Invoke `paybox_pay_x402` once. Treat returned proof material as `proof_ready`, not as confirmed redemption, debit, or settlement.
3. If either payment returns pending signing, present the returned handoff once and stop. On timeout, 5xx, malformed output, or unknown outcome, reconcile the same request once; never start a replacement payment.
4. Verify independent settlement evidence and record the transaction hash before marking the invoice `settled`.
5. Prepare a receipt with exact sender, recipients, invoice ID, amount, and transaction reference. Use `save_draft` without send authority. Use `reply_to_email` only after a fresh exact preview is approved.
6. Move the thread to the designated processed folder only after settlement state and receipt state are accurately recorded.
