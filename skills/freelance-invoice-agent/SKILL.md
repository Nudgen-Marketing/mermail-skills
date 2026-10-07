---
name: freelance-invoice-agent
description: A reusable Mermail Agent Skill that enables an AI agent to act as an automated freelance assistant. It handles client deliverable requests, generates payment requests via Mermail Agent Wallet, verifies incoming transactions, and securely fulfills deliverable delivery via Mermail Inbox upon payment confirmation.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 📬
---

# Automated Freelance Invoice & Payment Agent Skill

A reusable Mermail Agent Skill that enables an AI agent to act as an automated freelance assistant. It handles client deliverable requests, generates payment requests via Mermail Agent Wallet, verifies incoming transactions, and securely fulfills deliverable delivery via Mermail Inbox upon payment confirmation.

## What This Skill Enables

- **Automated Client Interaction:** Reads and responds to incoming client emails regarding project deliverables.
- **Wallet-Based Invoicing:** Generates transaction requests using the agent's dedicated Mermail Agent Wallet via MCP.
- **On-Chain Verification:** Checks the Mermail Agent Wallet for incoming payments matching the required amount.
- **Conditional Fulfilling:** Automatically emails the final deliverables or access links only after payment verification succeeds.

## How It Interacts with Mermail

1. **Mermail Inbox:**
   - Listens for incoming client query emails.
   - Sends the invoice email with the wallet address and payment instructions.
   - Delivers the final project files upon successful payment verification.

2. **Mermail Agent Wallet (via MCP):**
   - Retrieves the agent's public wallet address.
   - Queries real-time transaction history to confirm receipt of funds from the client before releasing deliverables.

## Workflow
[Client Email] ---> [Agent Reads via Mermail Inbox]
|
v
[Agent Sends Invoice & Wallet Address]
|
v
[Agent Polls Mermail Agent Wallet via MCP]
|
(Payment Received?)
/

YES           NO (Wait/Reminder)
/
v
[Agent Sends Final Deliverable via Mermail Inbox]

1. **Inquiry Phase:** Client emails the agent requesting a completed project deliverable (e.g., market research report, design asset, or code audit).
2. **Invoicing Phase:** Agent responds with an invoice breakdown and provides its Mermail Agent Wallet address.
3. **Payment & Verification Phase:** Client sends the agreed payment to the agent's wallet. The agent monitors transaction logs using the Mermail Wallet MCP tool.
4. **Fulfillment Phase:** Upon confirming the payment on-chain, the agent replies to the client's email thread with the final deliverables attached or linked.

## Example Prompts & Expected Results

### Prompt 1: Initial Client Request Processing
> **User Prompt:** "Check Mermail inbox for any new client requests for the 'Q3 Market Research Report'. If found, send them an invoice for 20 USDC with our Mermail wallet address."

**Expected Result:**
The agent checks the inbox, finds the client email, and sends a reply containing:
- Invoice details (20 USDC for Q3 Market Research Report).
- The Mermail Agent Wallet address for payment.

---

### Prompt 2: Payment Verification and Fulfillment
> **User Prompt:** "Check if we received 20 USDC in our Mermail wallet from client@example.com for the Q3 Report. If payment is confirmed, send the final report link to their email."

**Expected Result:**
1. The agent queries the Mermail Agent Wallet MCP tool.
2. Finds the matching 20 USDC transaction.
3. Sends a follow-up email via Mermail Inbox: *"Payment confirmed! Here is your download link for the Q3 Market Research Report: [Link]"*.
