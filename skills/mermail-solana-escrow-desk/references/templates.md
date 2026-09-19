# Solana Escrow Desk Templates

Standardized templates for policy grants, previews, and settlement receipts.

## 1. Standing Grant Policy Specification
```yaml
standing_grant:
  version: "1.0"
  chain: "solana"
  asset: "USDC"
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  max_daily_budget_usdc: 500
  max_per_tx_usdc: 100
  approved_payee_domains:
    - "basedhardware.com"
    - "superteam.fun"
  auto_dispatch_receipt: true
```

## 2. Interactive Approval Preview
```text
=== PAYBOX SOLANA TRANSFER PREVIEW ===
Invoice ID: #INV-2026-9812
Network: Solana Mainnet
Asset: USDC (SPL Token)
Amount: 75.00 USDC
Payee Address: 4N9HQfVSu7zjWLBD7WbaFroj79sDh4Sx76hRon7Vh86n
Status: Pending Human Authorization
Policy Check: Amount within daily budget allowance.
Proceed with transfer? (Y/N)
=====================================
```

## 3. Settlement Receipt Email Template
```text
Subject: Payment Receipt: [Invoice ID] - Settled on Solana

Dear [Payee Name],

We are pleased to confirm that your payment for [Invoice ID / Task Reference] has successfully settled on the Solana blockchain.

Transaction Summary:
- Network: Solana
- Asset: USDC (SPL)
- Amount: [Amount] USDC
- Recipient Wallet: [Payee Address]
- Transaction Signature: [Signature]
- Explorer Link: https://solscan.io/tx/[Signature]
- Timestamp: [UTC Timestamp]

Thank you for your partnership.

Sincerely,
Automated Accounts Payable
Powered by Mermail Agent Wallet & PayBox
```
