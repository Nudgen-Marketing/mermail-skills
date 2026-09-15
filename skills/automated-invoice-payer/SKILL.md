---
name: automated-invoice-payer
description: Scans the Mermail inbox for incoming invoices or payment requests, validates invoice parameters, and executes on-chain settlement via the Mermail Agent Wallet.
version: 1.0.0
author: Hypnotist
tags:
  - payments
  - invoices
  - automation
  - solana
  - mcp
---

# Automated Invoice Payer Skill

## Overview
The Automated Invoice Payer skill enables an autonomous AI agent to manage incoming payment requests and invoices received via the Mermail inbox. The agent parses sender information, payment amounts, and destination Solana addresses, verifies details against configured security guardrails, and safely executes the payout using the Mermail Agent Wallet via MCP.

## Capabilities & Features
- Inbox Parsing: Automatically retrieves and filters unread messages tagged with billing, invoice, or payout intents.
- Data Extraction: Extracts recipient public key, token mint (SOL / USDC), invoice reference ID, and payment amount.
- Safety Safeguards: Rejects malformed addresses, enforces maximum transfer thresholds, and flags unverified senders.
- On-Chain Settlement: Executes the transfer using Mermail Agent Wallet tools and logs the transaction signature.
- Audit Response: Sends a receipt email reply back to the issuer with the Solana explorer link.

---

## MCP Tool Requirements
This skill interacts with the following Mermail MCP tools:

| Tool Name | Purpose |
| :--- | :--- |
| mermail_get_unread_emails | Fetches unread emails from the agent's Mermail inbox. |
| mermail_get_email_details | Retrieves full body, metadata, and attachments for parsing. |
| mermail_wallet_get_balance | Verifies available funds before attempting execution. |
| mermail_wallet_transfer | Executes the Solana / SPL-token transfer to the payee. |
| mermail_send_email | Sends confirmation receipts back to the invoice issuer. |

---

## Step-by-Step Workflow

Detailed Steps:
1. Trigger: The agent is scheduled or prompted to inspect the Mermail inbox for billing notices.
2. Analysis: The agent parses the subject and message body for standard payment formats:
   - Target Solana Public Key (Base58)
   - Amount and Asset (e.g. USDC or SOL)
   - Invoice Reference Number
3. Safety Verification:
   - Validates that the destination address is a valid 32-44 character Base58 string.
   - Ensures the requested amount does not exceed the allowed agent spending ceiling.
   - Ensures sufficient agent wallet balance.
4. Execution: Calls mermail_wallet_transfer to broadcast the transaction.
5. Receipt & Closure: Dispatches an automated confirmation email back to the original sender containing the transaction signature.

---

## Example Prompts & Agent Interactions

Example 1: Standard Execution Run

User Prompt:
"Please scan my Mermail inbox for any new supplier invoices. If the invoice is under 25 USDC, pay it immediately and send back the transaction confirmation."

Agent Response:
"Checking Mermail inbox...  
Found 1 unread invoice from billing@node-services.io:
- Invoice ID: #INV-8821
- Payee: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
- Amount: 15.00 USDC

Validating payee address and spending limit... [OK]  
Checking wallet balance: 142.50 USDC available. [OK]  
Executing transaction via Mermail Agent Wallet...  
Status: Confirmed!  
Signature: 5Knb7Zq193...9xPQ2  

Sent payment confirmation email back to billing@node-services.io. Task complete."

---

## Configuration & Safety Rules

To prevent accidental overpayment or spam exploitation, configure the following parameters:

json
{
  "max_auto_pay_amount_usdc": 50.0,
  "allowed_tokens": ["USDC", "SOL"],
  "require_whitelisted_senders": false,
  "notify_user_on_complete": true
}

---

## How to Test Locally
1. Connect your AI MCP client (Cursor, Claude Desktop, or custom agent runtime) to the Mermail MCP server.
2. Send a test email to your agent's @mermail.ai address with an invoice subject and a devnet/mainnet Solana recipient address.
3. Instruct the agent:
  "Review incoming messages and list any payable items found."
4. Confirm the parsed parameters and approve settlement execution.
