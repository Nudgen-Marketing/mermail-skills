---
name: mermail-invoice-settler
description: Verify freelance contractor invoices and micro-bounty claims in a Mermail mailbox, validate deliverables against criteria, check Agent Wallet liquidity, and settle on-chain USDC payments via PayBox with cryptographic email receipts. Use when an autonomous agent is tasked with automated freelance bounty settlement, invoice triage, or deliverable verification. Do not use for read-only expense audits or unauthorized payments without explicit user policy.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "⚡"
---

# Mermail Invoice & Micro-Bounty Settler

Read [tools.md](references/tools.md), [security.md](references/security.md), and [workflows.md](references/workflows.md) before starting.

## Overview

Use this skill to enable an autonomous AI agent operating with a Mermail mailbox and Agent Wallet / PayBox connection to:
1. Detect and inspect incoming contractor invoices, bounty claims, and deliverable submissions.
2. Extract payee address, token currency, amount requested, and deliverable links (GitHub PR, commit, or artifact URL).
3. Validate deliverable acceptance against owner-defined criteria and pre-authorized spend limits.
4. Verify wallet liquidity with `get_paybox_connection` and `get_agent_wallet_portfolio`.
5. Execute on-chain settlement via `paybox_request_transfer`.
6. Issue an immutable email receipt to the contractor with the transaction signature and settlement breakdown via `send_email` or `reply_to_email`.

## Preferred Deliverables

- Grounded invoice summary linking contractor email ID, invoice number, requested token/amount, and deliverable URL.
- Verification status confirming deliverable validity and compliance with max authorized spend ceiling.
- Explicit settlement preview before dispatch: payee address, token asset, network, and amount.
- On-chain transfer submission via `paybox_request_transfer` with verified transaction signature.
- Confirmation email dispatched to the contractor containing the on-chain receipt.

## Workflow

1. **Inbox Polling & Invoice Discovery**:
   - Query mailbox with `search_emails` or `list_emails` filtering for pending invoice submissions or bounty tags.
   - Inspect candidate messages using `get_email` or `get_email_context`.
2. **Deliverable & Policy Validation**:
   - Parse contractor payment details: recipient wallet address, token currency, invoice amount, and deliverable URL.
   - Verify that the requested amount does not exceed the agent's pre-configured spending limit (e.g. 100 USDC).
   - If deliverable URL is missing, invalid, or exceeds policy ceiling, halt payment and flag for human supervisor review.
3. **Liquidity Pre-flight**:
   - Always call `get_paybox_connection` once before any PayBox operation.
   - Inspect available USDC and native gas balance via `get_agent_wallet_portfolio`.
4. **On-Chain Settlement**:
   - Call `paybox_request_transfer` with recipient wallet address, asset, and authorized amount.
   - Poll settlement confirmation once via `paybox_get_request` when needed.
5. **Receipt Dispatch**:
   - Generate and send an itemized receipt to the contractor using `reply_to_email` or `send_email`, quoting the transaction hash, settled amount, and date.
