
---
name: mermail-bounty-autopilot
description: Autonomous client commission desk and escrow settlement skill using Mermail Inbox and Agent Wallet. Scans incoming project proposals, verifies completion milestones, and triggers micro-payments.
---

# Mermail Bounty & Client Autopilot

## Overview
`mermail-bounty-autopilot` empowers an AI Agent to autonomously manage freelance micro-bounties and commission inquiries directly through Mermail's native MCP integration. It processes inbound client agreements from the Mermail Inbox and utilizes the Agent Wallet to settle milestone bounties without manual friction.

## Capabilities
1. **Inbox Triage**: Detects commission inquiries, milestone deliveries, and verification requests.
2. **Milestone Extraction**: Parses task scopes, deliverable GitHub links, and requested payment amounts in USDC/SOL.
3. **Wallet Settlement**: Directly authorizes and signs release transactions via Mermail Agent Wallet upon verified milestone checks.
4. **Automated Notification**: Replies to the counterpart via Mermail inbox confirming on-chain transaction hashes.

---

## Tool & MCP Requirements
This skill communicates with Mermail via Model Context Protocol (MCP):
- `mermail_get_messages`: Retrieves incoming emails/proposals.
- `mermail_read_message`: Reads message body, attachments, and metadata.
- `mermail_send_message`: Sends confirmation emails and transaction receipts.
- `mermail_wallet_balance`: Checks available agent treasury balances.
- `mermail_wallet_transfer`: Initiates on-chain settlement transactions.

---

## Autonomous Workflow

[Inbound Email in Mermail Inbox]
│
▼
Step 1: Inbound Triage & Classification
│
▼
Step 2: Verification of Milestone / Code Proof
│
▼
Step 3: Execute Agent Wallet Settlement
│
▼
Step 4: Send Final Confirmation & Receipt via Mermail


### Step 1: Inbound Triage
1. Call `mermail_get_messages` with filter `folder="inbox"`, `unread=true`.
2. Inspect headers to extract sender address, subject line, and project tag.
3. Classify message intent into:
   - `INQUIRY`: Rate/proposal request.
   - `DELIVERABLE`: Work submitted for payout verification.
   - `PAYMENT_RELEASE`: Client approving task funds.

### Step 2: Milestone Verification
When processing `DELIVERABLE`:
- Extract the submission link (e.g., Pull Request, deployment URL, or attachment).
- Run automated checksum or schema verification on the deliverable.
- Ensure the recipient wallet address matches Solana public key specifications.

### Step 3: Wallet Transfer Execution
1. Query available balance using `mermail_wallet_balance(token="USDC")`.
2. If balance covers the approved payout:
   - Call `mermail_wallet_transfer(recipient="<solana_address>", amount=<payout_amount>, token="USDC")`.
   - Store resulting `tx_signature`.

### Step 4: Receipt Dispatch
Send a reply to the sender via Mermail:
```markdown
Subject: Re: Deliverable Verified - Payment Released
Body:
Your submitted deliverable has been verified. 
Payment of <amount> USDC has been dispatched via Mermail Agent Wallet.
Transaction Signature: <tx_signature>
Example Prompts & Agent Interactions
Trigger Prompt:
"Agent, check my Mermail inbox for any approved deliverable submissions and settle any verified bounties under 50 USDC using my Agent Wallet."
Expected Agent Output:
{
  "status": "success",
  "action": "mermail_bounty_settled",
  "inbox_sender": "client@example.com",
  "milestone": "Frontend Landing Page v1 Fix",
  "amount_usdc": 35.0,
  "recipient_wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "tx_signature": "5KnmV...8XqW",
  "email_reply_sent": true
}

---

### ૨. સબમિશન સ્ટેપ્સ (આ રીતે ભાગ લેવો):

1. **GitHub Pull Request (PR):**
   * Mermail ના અધિકૃત રીપોઝીટરી `Nudgen-Marketing/mermail-skills` ને Fork કરો.
   * તમારા ફોર્કમાં નવું ફોલ્ડર બનાવો: `mermail-bounty-autopilot` અને ઉપરનો `SKILL.md` ઉમેરો.
   * `Nudgen-Marketing/mermail-skills` સામે **Pull Request (PR)** ઓપન કરો.

2. **૨ થી ૫ મિનિટનો ડેમો વીડિયો (સ્ક્રીન રેકોર્ડિંગ):**
   * તમારા ફોન અથવા સિસ્ટમ પર સ્ક્રીન રેકોર્ડર ચાલુ કરો (અંગ્રેજીમાં બોલીને અથવા સ્ક્રીન પર ટેક્સ્ટ/સ્ક્રિપ્ટ રન કરીને).
   * વીડિયોમાં બતાવો:
     * તમે ક્લાયન્ટ ટૂલ (જેમ કે Cursor / Claude / Gemini CLI) માં આ સ્કીલ લોડ કરી.
     * પ્રોમ્પ્ટ આપ્યો: *"Check Mermail inbox and process verified bounties"*.
     * એજન્ટે મેસેજ વાંચ્યો અને ટ્રાન્ઝેક્શન કન્ફર્મ કર્યું.
   * આ વીડિયો **X (Twitter)** પર પોસ્ટ કરો અને સાથે લખો:
     > *"Built the mermail-bounty-autopilot skill for @Mermailapp! Enables autonomous inbox scanning, milestone verification, and instant wallet settlements. PR submitted! 🚀"*  
     > *(અને @Mermailapp ને ટેગ કરો)*

3. **Superteam Earn પર સબમિટ કરો:**
   * તમારી **GitHub PR લિંક** અને **X વિડીયો લિંક** સાથે Superteam Earn ના ફોર્મમાં ૧ ક્રેડિટ વાપરી સબમિટ કરી દો.

તમારી પાસે આના માટે **૭ દિવસનો સમય** છે, જેથી આરામથી ઉત્તમ ગુણવત્તાવાળો ડેમો બનાવીને $૫૦૦ ના પૂલમાંથી મોટું ઇનામ જીતી શકાય!
