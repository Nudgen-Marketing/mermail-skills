# Mermail Invoice Settlement Agent — Workflows Reference

```mermaid
sequenceDiagram
    autonumber
    actor Vendor as Contractor / Vendor
    participant Inbox as Mermail Inbox
    participant Agent as Invoice Settlement Agent
    actor Owner as Workspace Owner
    participant PayBox as Mermail PayBox
    participant Chain as Blockchain (Solana / EVM)

    Vendor->>Inbox: Sends Invoice Email (with address & amount)
    Inbox->>Agent: Triggers triage or get_email_context
    Agent->>Agent: Parse line items, amount & address
    Agent->>PayBox: get_paybox_connection & paybox_get_balance
    Agent->>Owner: Present Approval Card (Vendor, Amount, Destination)
    alt Owner Rejects or Requests Revision
        Owner->>Agent: Reject / Clarify
        Agent->>Inbox: reply_email with inquiry or rejection
    else Owner Approves
        Owner->>Agent: Authorize Settlement
        Agent->>PayBox: paybox_transfer(recipient, amount, USDC)
        PayBox->>Chain: Broadcast transaction
        Chain-->>PayBox: Emit transaction signature / hash
        PayBox-->>Agent: Settlement Success Confirmation
        Agent->>Inbox: reply_email with tx hash & receipt
        Agent->>Inbox: manage_mailbox_labels(tag: "status:settled")
    end
```

## Detailed Execution Steps

### 1. Ingestion & Validation
1. Extract currency. Only `USDC`, `USDT`, and major stablecoins supported by PayBox are valid for automated settlement. Fiat invoices require explicit conversion quote.
2. Verify address checksum:
   - Solana: 32–44 base58 characters.
   - EVM: 42-character hex with valid checksum (`0x...`).

### 2. Idempotency Check
1. Query workspace invoice ledger for `invoice_id`.
2. If `invoice_id` has already been recorded as `settled`, halt immediately and alert the user with duplicate detection warning.

### 3. Settlement Execution
1. Verify PayBox connection status is `ACTIVE`.
2. Construct transfer payload with exact principal amount.
3. Upon receiving transaction hash, construct the block explorer URL (`solscan.io` or `basescan.org`).
