# Crypto Invoicing Workflows

This document details the exact execution steps for generating, sending, tracking, and closing cryptographic invoices via Mermail.

---

## Workflow 1: Invoice Generation & Delivery

### Trigger
User or upstream task triggers invoice creation:
> "Send an invoice to client@acme.corp for 250 USDC for completing the Second Brain CLI export module."

### Execution Sequence

1. **Parameter Resolution**:
   - Client Email: `client@acme.corp`
   - Amount: `250.00`
   - Currency: `USDC` (Solana SPL Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
   - Description: "Second Brain CLI export module implementation"
   - Invoice ID: `INV-2026-0104`

2. **Mailbox Resolution**:
   - Call `list_mailboxes` to get sender `mailboxId` (e.g. `billing@agency.agent`).

3. **Payment URI Assembly**:
   - Construct Solana Pay link:
     ```text
     solana:GgEZhQZcXxM9Gk7p1Rz9t8xY8w9F...5G8?amount=250.00&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=INV20260104&label=Agency%20Services&memo=INV-2026-0104
     ```

4. **Email Composition & Sending**:
   - Call `send_email`:
     ```json
     {
       "mailboxId": "mbx_pub_01h8...",
       "to": ["client@acme.corp"],
       "subject": "Invoice INV-2026-0104 from Agency Services ($250.00 USDC)",
       "body": "Dear Client,\n\nPlease find your invoice INV-2026-0104 for the completed Second Brain CLI export module.\n\nTotal Due: 250.00 USDC\nNetwork: Solana (SPL USDC)\nPayment Address: GgEZhQZcXxM9Gk7p1Rz9t8xY8w9F...5G8\nSolana Pay Link: solana:GgEZhQZcXxM9Gk7p1Rz9t8xY8w9F...5G8?amount=250.00&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=INV20260104\n\nThank you for your business!"
     }
     ```

---

## Workflow 2: Payment Verification & Receipt Issuance

### Trigger
Client replies to the invoice thread with a transaction hash:
> "Just sent 250 USDC. Tx signature: 4Z9n8K7y2mP1..."

### Execution Sequence

1. **Thread Correlation**:
   - Call `search_threads` with `query: "INV-2026-0104"`.
   - Call `get_thread` to fetch latest inbound message and extract `4Z9n8K7y2mP1...`.

2. **Signature Verification**:
   - Inspect transaction on Solana / explorer to verify:
     - Confirmed / Finalized status.
     - Destination address matches recipient wallet.
     - Transferred token amount equals 250.00 USDC.

3. **Receipt Issuance**:
   - Call `send_email` in the existing thread:
     ```json
     {
       "mailboxId": "mbx_pub_01h8...",
       "to": ["client@acme.corp"],
       "subject": "Re: Invoice INV-2026-0104 from Agency Services - PAID RECEIPT",
       "body": "Dear Client,\n\nWe have received and verified your payment of 250.00 USDC.\n\nReceipt Details:\n- Invoice ID: INV-2026-0104\n- Status: PAID\n- Amount: 250.00 USDC\n- Transaction Signature: 4Z9n8K7y2mP1...\n- Explorer Link: https://solscan.io/tx/4Z9n8K7y2mP1...\n\nThank you for your prompt payment!",
       "in_reply_to": "msg_01h8..."
     }
     ```
