# Solana Escrow Desk Workflows

Standard operating sequences for autonomous invoice processing and settlement.

## Sequence A: Invoice Triage to Payout Preview
1. Call `list_mailboxes` to identify active finance/escrow mailbox.
2. Call `list_emails` with unread filter and keywords (`claim`, `invoice`, `bounty`).
3. For each candidate message, retrieve details via `get_email`.
4. Parse recipient address, token, amount, and reference identifier.
5. Validate recipient address matches standard Solana Base58 format.
6. Check standing policy: if amount is within auto-approve threshold (e.g. <= 50 USDC) and recipient domain is allowlisted, proceed to Sequence B. Otherwise, generate an approval preview and notify the user.

## Sequence B: Balance Verification & PayBox Transfer
1. Call `get_paybox_connection` to confirm active OAuth session.
2. Call `paybox_get_portfolio` with `chain: "solana"`.
3. Verify USDC balance >= payment amount + estimated gas margin.
4. Execute `paybox_request_transfer` with exact parameters and idempotency token.
5. Record `request_id` from PayBox response.

## Sequence C: Settlement Reconciliation & Receipt Delivery
1. Poll `paybox_get_request` with `request_id`.
2. Upon receiving status `completed` / `settled`:
   - Extract Solana transaction hash (`tx_hash`).
   - Compose receipt email with subject `Payment Receipt: [Invoice ID] - Settled on Solana`.
   - Include amount, asset, recipient address, timestamp, and Solscan explorer link.
   - Dispatch email using `send_email`.
   - Update message status with `update_email` adding the `Settled` label.
