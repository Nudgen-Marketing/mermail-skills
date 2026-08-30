---
name: mermail-autonomous-bounty-settler
description: Autonomous bounty review, PR verification, and on-chain USDC settlement agent using Mermail Inbox and Agent Wallet.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "⚡"
---

# Mermail Autonomous Bounty Settler

An intelligent agent skill that monitors an autonomous project inbox for inbound bug bounty submissions, validates pull request test hashes against repository standards, executes on-chain USDC bounty payouts via the user-controlled **Mermail Agent Wallet**, and dispatches signed email receipts and confirmation threads back to the contributor.

Read [tools.md](references/tools.md) before calling Mermail tools. Always review [security.md](references/security.md) to ensure prompt injection defense and strict per-transaction budget limits.

---

## 🎯 Capabilities

1. **Inbound Bounty Intake (`mermail_list_emails`, `mermail_get_email`)**:
   - Polls and parses inbound bounty claim emails submitted to the agent mailbox.
   - Extracts contributor GitHub handle, pull request URL, issue number, and payout destination (EVM/Solana address).
2. **Deterministic Verification Harness**:
   - Inspects pull request CI test pass rate, code coverage, and commit hashes.
   - Computes bounty claim validity against project escrow rules.
3. **On-Chain Agent Wallet Settlement (`mermail_execute_wallet_transfer`)**:
   - Checks agent wallet balance via Mermail MCP.
   - Executes authorized USDC / SOL transfer to contributor's verified wallet address.
   - Obtains cryptographic transaction hash.
4. **Receipt & Notification Dispatch (`mermail_send_email`)**:
   - Sends structured confirmation email containing the on-chain transaction hash, explorer link, and merge approval receipt.

---

## 🔄 End-to-End Workflow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MERMAIL AUTONOMOUS BOUNTY SETTLER WORKFLOW                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. INTAKE      │ Agent receives inbound bounty claim email via Mermail Inbox.          │
│ 2. VALIDATION  │ Agent verifies PR status, passing CI checks, and claimant identity.   │
│ 3. SETTLEMENT  │ Agent invokes Mermail Agent Wallet to dispatch USDC transfer on-chain.│
│ 4. RECEIPT     │ Agent emails cryptographic transaction hash and receipt to contributor│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Confirm MCP Connectivity:** Ensure `mermail` MCP server is connected (`https://console.mermail.app/mcp`).
2. **Query Mailbox:** Resolve target mailbox `public_id` and list unread messages with subject `[BOUNTY CLAIM]`.
3. **Parse & Validate:**
   - Extract claimant EVM/Solana address and GitHub PR reference.
   - Verify CI pass status (100% green tests required).
4. **Execute Transfer:** Call `mermail_transfer_funds` with:
   - `recipient`: Contributor payout address
   - `amount`: Verified bounty reward (e.g. `250.00`)
   - `currency`: `"USDC"`
   - `memo`: `"Bounty settlement for PR #<number>"`
5. **Send Confirmation Email:** Dispatch formatted Markdown email to contributor with transaction explorer link.

---

## 💬 Example Prompt

```text
Check the Mermail inbox for recent bounty submissions on repository 'Solana-DeFi-Core'. 
For any valid submission with passing CI tests:
1. Verify the pull request and extract the claimant's payout wallet address.
2. Transfer the $500 USDC bounty reward using the Mermail Agent Wallet.
3. Send a confirmation email back to the contributor with the transaction hash and thank-you note.
```
