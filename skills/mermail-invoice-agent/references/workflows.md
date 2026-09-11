# Workflows for Mermail Invoice Agent

## Workflow 1: Invoice Discovery & Extraction
1. Operator invokes agent: "Scan unread invoices in Finance mailbox".
2. Agent queries `search_emails` with query `is:unread invoice`.
3. Agent reads target email with `get_email` and reads bounded context via `get_email_context`.
4. Agent parses line items, total amount, currency, due date, invoice ID, and payout address into a structured record.

## Workflow 2: Balance Check & Proposal Generation
1. Agent queries `paybox_get_portfolio` or `get_agent_wallet_portfolio`.
2. Compares available balance against requested payment amount + network fee buffer.
3. If balance is sufficient and within auto-pay policy:
   - Formulate transfer proposal with `create_agent_wallet_transfer_proposal`.
4. If balance is insufficient:
   - Mark as `insufficient_funds` and notify operator with needed top-up amount.

## Workflow 3: Execution & Vendor Receipt
1. Upon verified authorization, invoke `paybox_request_transfer` or `paybox_pay_x402`.
2. Await confirmed transaction hash.
3. Compose professional payment receipt using `save_draft` or `reply_to_email`.
4. Archive the thread to the designated folder using `move_email`.