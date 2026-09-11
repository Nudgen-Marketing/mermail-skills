---
name: mermail-invoice-settler
version: 1.0.0
description: Autonomous invoice verification and micropayment settlement skill using Mermail MCP inbox and agent wallet.
author: Antigravity Agent Builder
homepage: https://mermail.app
tags:
  - mermail
  - mcp
  - payments
  - automation
  - email
---

# Mermail Invoice & Micro-Bounty Settlement Skill

This skill enables an autonomous AI agent to monitor its Mermail inbox for incoming freelance invoices or micro-bounty claims, verify deliverable completion against criteria, execute on-chain payments via the Mermail Agent Wallet, and reply with an immutable cryptographic receipt.

## 1. What This Skill Enables
- **Hands-Off Freelance Settling**: The agent acts as an autonomous payer for software bounties, data tasks, or API service invoices.
- **Inbox-to-Wallet Bridge**: Integrates Mermail's email parser with Mermail's MCP wallet tools.
- **Cryptographic Audit Trail**: Returns transaction signatures and invoice status directly to the sender via email.

---

## 2. MCP Tools Used
This skill connects to the Mermail Model Context Protocol (MCP) server:
* `mermail_fetch_unread_emails`: Retrieves unread invoices/bounties from `agent@mermail.app`.
* `mermail_get_email_details`: Extracts sender address, requested payout amount, currency, and deliverable URL.
* `mermail_agent_wallet_balance`: Verifies wallet liquidity.
* `mermail_agent_wallet_transfer`: Executes on-chain USDC/SOL transfer to the recipient's wallet.
* `mermail_send_email`: Sends automated confirmation with transaction hash and receipt details.

---

## 3. Workflow Steps

```
[Contractor sends email to agent@mermail.app with invoice + deliverable link]
                                |
                                v
               [Step 1: Check Mermail Unread Inbox]
                                |
                                v
               [Step 2: Parse Invoice & Verify Deliverables]
                 - Check GitHub PR or document URL
                 - Verify requested amount <= Max approved budget
                                |
                                v
               [Step 3: Check Agent Wallet Balance]
                                |
                                v
               [Step 4: Execute On-Chain Transfer via Wallet MCP]
                                |
                                v
               [Step 5: Send Email Confirmation with Tx Hash]
```

### Step-by-Step Execution:

1. **Poll & Filter Messages**:
   Agent calls `mermail_fetch_unread_emails(filter="invoice")` to detect pending payment requests.

2. **Extraction & Verification**:
   Extract:
   - `recipient_wallet`: Recipient on-chain address (Solana or EVM).
   - `amount`: Token amount requested (e.g., `50 USDC`).
   - `proof_link`: URL to GitHub PR, commit, or deliverable.
   Verify that `amount` does not exceed the agent's pre-authorized spending limit (e.g., 250 USDC).

3. **Check Wallet Balance**:
   Call `mermail_agent_wallet_balance(token="USDC")` to ensure sufficient funds.

4. **Execute Payment**:
   Call `mermail_agent_wallet_transfer`:
   ```json
   {
     "to": "RecipientWalletAddressHere...",
     "amount": 50,
     "token": "USDC",
     "network": "solana"
   }
   ```

5. **Acknowledge and Reply**:
   Call `mermail_send_email`:
   ```json
   {
     "to": "contractor@example.com",
     "subject": "Payment Confirmation: Invoice #1042 Settled",
     "body": "Hello,\n\nYour deliverable has been verified and settled.\nTransaction Signature: 5Kj1...TxHash\nAmount: 50 USDC\nNetwork: Solana\n\nThank you,\nAutonomous Agent via Mermail"
   }
   ```

---

## 4. Example Prompts & Expected Results

### Example Trigger Prompt:
> *"Check my Mermail inbox for any new bounty invoices under $100. Verify the submitted GitHub links, settle approved payments from my agent wallet, and email back the transaction receipts."*

### Expected Agent Behavior:
1. Agent identifies 1 unread email from `contributor@dev.com` with invoice for `25 USDC` for fixing a bug in repository `example/repo`.
2. Agent inspects the GitHub PR, confirms the commit exists and tests pass.
3. Agent triggers `mermail_agent_wallet_transfer(to="...", amount=25, token="USDC")`.
4. Transaction succeeds with signature `4w3Z9F...`.
5. Agent generates and sends confirmation email.
6. Returns summary to user: *"Settled invoice #1042 for 25 USDC to 7Xq... via Solana. Confirmation email dispatched."*

---

## 5. Security & Safety Limits
- **Max Single Transaction Limit**: 100 USDC default.
- **Whitelisted Recipient Domain Check**: Discards unauthenticated spam emails.
- **Human Escalation**: If an invoice exceeds the limit or deliverable link is invalid, agent forwards the email to human supervisor without spending funds.
