# Crypto Invoice Settlement Workflows

## 1. Invoice Intake and Entity Extraction
1. Search active inbox threads for invoice signals:
   - Queries: `subject:invoice`, `subject:payment request`, `has:attachment`
2. Parse body text and attached invoices for:
   - Recipient Name and Company
   - Invoice ID (e.g. `INV-2026-001`)
   - Due Date and Issue Date
   - Token Asset and Network (e.g. USDC on Base, ETH on Arbitrum)
   - Settlement Address (EVM, Solana, or Monero)
   - Total Amount Due

## 2. Policy Validation
1. Verify vendor authenticity:
   - Confirm sender email domain matches expected vendor records.
2. Check duplicate invoice database:
   - Ensure the Invoice ID has not already received an on-chain transaction hash.
3. Compare against spend limits:
   - Standard automated cap: up to $500 USDC.
   - Any invoice exceeding $500 USDC routes to the owner with `signing_handoff`.

## 3. PayBox Execution and Handoff
1. Call `get_paybox_connection` to ensure wallet is active.
2. Call `paybox_request_transfer` with:
   - `credential`: primary
   - `chain`: base / arbitrum / ethereum
   - `asset`: USDC
   - `amount`: invoice amount
   - `destination`: verified address
3. If signature is needed, output the exact `console_url` signing handoff link.

## 4. Reconciliation and Reply
1. Reconcile settlement with `paybox_get_request`.
2. Format response email draft:
   - Subject: `Re: [Invoice ID] Payment Confirmation`
   - Body: Summary of payment, amount, destination address, and explorer URL (`https://basescan.org/tx/...`).
