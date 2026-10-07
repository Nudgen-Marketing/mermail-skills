---
name: mermail-invoice-settlement-agent
description: Ingest, verify, and settle contractor, vendor, or freelancer invoices directly from a Mermail inbox using the Mermail Agent Wallet / PayBox. Use when an email contains an invoice, payment request, or bill that must be validated against milestone contracts, approved by the workspace owner, settled on-chain via USDC, and confirmed with an automated reply and receipt thread. Never execute on-chain transfer without explicit owner authorization. Never execute payments from unverified sender domains without strict quarantine verification.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 🧾
---

# Mermail Invoice Settlement Agent

## Overview

Use this skill to automate the end-to-end lifecycle of inbound vendor, contractor, and freelancer invoices arriving in a Mermail agent inbox:

1. **Detection & Extraction:** Detect invoice communications, extract structured invoice metadata (invoice ID, line items, total amount, currency, recipient settlement address, network, due date, vendor identity).
2. **Contract & Policy Verification:** Cross-check the requested amount against the workspace budget, vendor history, and milestone agreements. Flag anomalies, price deviations, or duplicate invoices.
3. **Approval Staging:** Generate an immutable settlement preview for the workspace owner distinguishing total invoice liability, destination address, network fees, and wallet balance.
4. **On-Chain Settlement:** Upon explicit owner approval, invoke Mermail PayBox (`paybox_transfer` or `paybox_pay_x402`) to settle the exact authorized amount in USDC.
5. **Receipt & Closing:** Record the on-chain transaction signature, compose a professional acknowledgment reply directly in the originating Mermail thread, attach the settlement receipt, and tag the email as `settled`.

Read [tools.md](references/tools.md) for the exact Mermail Inbox and PayBox MCP tools this workflow orchestrates. Read [workflows.md](references/workflows.md) for sequence diagrams, amount validation, and retry logic. Read [security.md](references/security.md) for prompt injection defense, address spoofing protection, and quarantine policies.

---

## Preferred Deliverables

- **Structured Invoice Record:** Normalized JSON containing `invoice_id`, `vendor_name`, `vendor_email`, `amount_usdc`, `recipient_address`, `chain` (e.g., `solana`, `base`, `arbitrum`), and `due_date`.
- **Pre-Settlement Verification Audit:** A verification report confirming:
  - Sender authenticity (SPF/DKIM alignment through Mermail email metadata).
  - Absence of duplicate invoice numbers in the workspace historical log.
  - Sufficient PayBox USDC balance for principal + gas fees.
- **Explicit Owner Preview:** A clean, human-readable confirmation block presenting the vendor, amount, destination address, and action buttons before any financial transaction is initiated.
- **On-Chain Execution Record:** The immutable transaction hash/signature emitted by Mermail PayBox.
- **Threaded Acknowledgment Reply:** An email reply sent to the vendor containing the payment timestamp, transaction explorer link, and updated invoice status.

---

## Interaction Budget

- Perform inbox search, email extraction, attachment parsing, and balance verification autonomously in a single preflight step. Do not narrate intermediate read-only calls.
- Present exactly **one** consolidated settlement confirmation prompt to the user per invoice.
- Require explicit authorization before calling any mutating financial tool (`paybox_transfer` or `paybox_pay_x402`). Never assume implicit spend consent for invoices exceeding $0.
- If an invoice address differs from a previously whitelisted vendor address, highlight the discrepancy in bold warning text and require manual re-confirmation.

---

## Workflow

### 1. Inbound Triage & Extraction
- Query incoming messages with `search_messages` or `get_email_context` targeting subject lines containing `invoice`, `bill`, `payment request`, or `milestone completion`.
- Parse the email body and any attached invoice PDFs or plaintext blocks:
  - Extract line items and subtotal.
  - Extract recipient wallet address (e.g. Solana base58 or EVM 0x address).
  - Extract payment terms and due dates.
- Reject unparseable or ambiguous payment requests with a clarification draft to the sender.

### 2. Security & Policy Verification
- Check sender email address against workspace authorized vendors.
- Query PayBox state using `get_paybox_connection` and verify current holdings via `paybox_get_balance`.
- If current balance < required invoice amount, compute the shortfall and provide the owner with a `paybox_get_buy_link` top-up recommendation.

### 3. Owner Review & Approval Handoff
- Format the structured approval card:
  ```text
  INVOICE SETTLEMENT REQUEST
  Vendor: Acme Design Studio (billing@acme.dev)
  Invoice ID: INV-2026-088
  Amount: 250.00 USDC
  Network: Solana
  Destination Address: DkM86ES17UmPuGAmUsGr86XUgbrBb53aMuYE2vGJ2ZUV
  Wallet Balance: Available
  
  [Approve Settlement] | [Reject Invoice] | [Request Revision]
  ```
- Pause execution until the owner explicitly approves.

### 4. Settlement Execution
- Call `paybox_transfer` with:
  - `recipient`: Validated vendor address.
  - `amount`: Exact invoice total.
  - `asset`: `USDC`.
  - `chain`: Target blockchain.
- Capture the returned `transaction_hash` or `signature`.

### 5. Vendor Confirmation & Audit Archival
- Compose threaded reply using `reply_email`:
  - Thank the vendor for their delivery.
  - Provide transaction hash and public block explorer link.
  - Confirm invoice `INV-2026-088` is settled in full.
- Label the message thread with `status:settled` using `manage_mailbox_labels`.
