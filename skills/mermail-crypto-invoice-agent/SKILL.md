---
name: mermail-crypto-invoice-agent
description: Autonomous cryptographic invoicing, USDC settlement tracking, and payment receipt issuance over email via Mermail. Use when an AI agent, service provider, or freelancer needs to generate an itemized cryptographic invoice, deliver it with payment instructions (Solana Pay, EVM, or x402), monitor inbound confirmation receipts, verify settlement, and send finalized payment confirmations.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "💳"
---

# Mermail Crypto Invoice Agent

## Overview

Use this skill to automate the end-to-end lifecycle of cryptographic invoicing, payment requests, and receipt confirmations over email through the Mermail platform.

The agent enables autonomous systems and human operators to:
1. **Generate Itemized Invoices**: Produce structured cryptographic invoices containing line items, currency specs (USDC, SOL, ETH), due dates, and settlement addresses.
2. **Issue Payment Emails**: Draft or send professional, branded HTML/plain-text invoice emails through Mermail MCP with embedded Solana Pay URI (`solana:`), EVM payment links, or x402 payment headers.
3. **Track Inbound Confirmations**: Monitor inbox threads for customer payment notices, transaction hashes (`tx_hash`), or PayBox settlement notifications.
4. **Verify Settlement & Issue Receipts**: Verify on-chain payment proofs and automatically generate and send a cryptographic payment receipt to the client.

Treat every invoice send and receipt issuance as an **external effect** requiring clear parameter validation and user approval boundaries.

Read [tools.md](references/tools.md) for live Mermail MCP and PayBox integration contracts.
Read [workflows.md](references/workflows.md) for detailed execution sequences (invoice creation, delivery, verification, and receipting).
Read [security.md](references/security.md) for transaction hash validation, address sanitization, and anti-spoofing guards.

## Preferred Deliverables

- An itemized invoice manifest (`INV-YYYY-XXXX`) specifying client details, line items, subtotal, accepted token/chain, and recipient payment address.
- A clean, mobile-responsive HTML/text email payload rendered with payment action buttons and copyable blockchain addresses.
- An auditable settlement record logging transaction signature, timestamp, block explorer verification URL, and settlement status.
- A finalized payment receipt email confirming receipt of funds and marking the invoice `PAID`.

## Core Workflow

### 1. Invoice Specification & Drafting
- Collect or derive line items, quantity, unit price, and currency denomination (`USDC`, `SOL`, `ETH`).
- Generate a unique invoice reference ID (e.g. `INV-2026-0042`).
- Construct the settlement URI:
  - **Solana Pay**: `solana:<RECIPIENT_PUBKEY>?amount=<AMOUNT>&spl-token=<USDC_MINT>&reference=<REF_PUBKEY>&label=<LABEL>&memo=<MEMO>`
  - **x402 Micropayment**: Header `x-payment-request: x402://<GATEWAY>/invoice/<ID>`
  - **EVM / Base / Arbitrum**: `ethereum:<RECIPIENT_ADDRESS>@<CHAIN_ID>/transfer?address=<USDC_CONTRACT>&uint256=<AMOUNT_RAW>`
- Format the invoice body with a clear payment summary, expiration window, and itemization table.

### 2. Delivery via Mermail MCP
- Resolve sender mailbox with `list_mailboxes` (prefer mailbox `public_id`).
- When user approval is pending, invoke `save_draft` so the operator can inspect the invoice.
- When approved, invoke `send_email` with client email in `to`, invoice ID in `subject`, and payment links in the body.

### 3. Payment Monitoring & Thread Correlation
- When polling or checking for client responses, invoke `search_threads` with `query: "INV-2026-0042"`.
- Fetch inbound message details using `get_thread` to inspect reply bodies for transaction signatures (`tx_hash` / `signature`).
- If integrated with Mermail Agent Wallet (PayBox), invoke `get_paybox_connection` and verify inbound settlement events.

### 4. Settlement Verification & Receipt Issuance
- Verify transaction validity (check network, recipient address match, and exact token amount).
- Generate a cryptographic payment receipt noting `Status: PAID`, `Settled At: <TIMESTAMP>`, and `Tx: <EXPLORER_LINK>`.
- Send the finalized receipt reply in the existing thread via `send_email` (`in_reply_to: <THREAD_ID>`).
