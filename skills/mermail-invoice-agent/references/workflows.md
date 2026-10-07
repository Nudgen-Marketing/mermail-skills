# Workflow reference

Step-by-step procedures for accounts payable audit, on-chain disbursement, and receipt dispatch.

## Accounts payable workflow

### 1. Inbound scan and triage
1. List unread messages in the designated invoice folder using `list_emails` with native JSON query filter.
2. For each candidate message, retrieve sender context with `get_email_context`.
3. Verify `sender_authentication.status === 'pass'`. If authentication fails or reports `unknown`, label the email `invoice-suspicious` via `update_email` and stop.
4. Retrieve full email body with `get_email`.

### 2. Invoice parsing and extraction
1. Extract structured invoice properties:
   - `invoice_number`: Vendor invoice identifier
   - `vendor_name`: Organization or contractor name
   - `vendor_email`: Authenticated sender address
   - `amount`: Numeric billing total
   - `currency`: Stablecoin or native asset (USDC, USDT, SOL, ETH)
   - `recipient_address`: Destination wallet address
   - `due_date`: Payment deadline
2. Query `search_emails` using `invoice_number` and `vendor_name` to confirm this invoice has not already been paid or queued.
3. Verify `recipient_address` against the active vendor allowlist. If unlisted, request explicit human registration before proceeding.

### 3. Balance verification and proposal staging
1. Check PayBox connection state with `get_paybox_connection`.
2. Inspect current balances with `get_agent_wallet_portfolio`. Confirm sufficient funds cover the invoice total plus estimated gas fees.
3. Create transfer proposal via `create_agent_wallet_transfer_proposal` or stage PayBox transfer via `paybox_request_transfer`.
4. Surface the settlement summary to the operator for review.

### 4. Settlement execution and receipt dispatch
1. Once operator signing completes, verify on-chain confirmation or transaction hash.
2. Compose a payment acknowledgement email to the vendor using `reply_to_email` or `send_email`. Include:
   - Subject: `Payment Confirmation: Invoice [invoice_number]`
   - Vendor name and reference ID
   - Settled amount and token
   - On-chain transaction hash and block explorer link
   - Settlement timestamp (UTC)
3. Update email labels to `invoice-paid` using `update_email`.

## Accounts receivable workflow

1. Generate structured payment request with invoice identifier, line items, accepted tokens, and agent wallet deposit address.
2. Send invoice email to client via `send_email`.
3. Monitor inbound transactions on agent wallet address.
4. When incoming transfer confirms, correlate payment to open invoice and send automated receipt.
