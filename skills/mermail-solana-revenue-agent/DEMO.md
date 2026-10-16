# Mermail Solana Revenue Agent — 2-Minute Video Demonstration & Pitch

## 📺 Video Overview & Timestamps

- **Video Pitch Title:** Autonomous Solana Revenue Triage & PayBox Settlement with Mermail MCP
- **Target Audience:** Web3 Builders, DeFi Founders, AI Agent Developers, Mermail Community
- **Video Link / Host:** [https://github.com/wiliancolomboo-tech/mermail-skills/blob/feat/mermail-solana-revenue-agent/skills/mermail-solana-revenue-agent/DEMO.md](https://github.com/wiliancolomboo-tech/mermail-skills/blob/feat/mermail-solana-revenue-agent/skills/mermail-solana-revenue-agent/DEMO.md)
- **Live PR:** [https://github.com/Nudgen-Marketing/mermail-skills/pull/152](https://github.com/Nudgen-Marketing/mermail-skills/pull/152)

---

## ⏱️ Video Script & Step-by-Step Breakdown

### 0:00 - 0:30 | Introduction & The Problem
> **[Speaker / Screen: Terminal & Mermail Architecture Diagram]**
> *"Hi everyone! AI agents today can write code and analyze data, but they lack autonomous financial execution and email communication channels. When a client sends an invoice to your agent's inbox, or a bounty sponsor sends a prize notification, how does your agent verify the transaction, execute non-custodial Solana settlements, and deliver cryptographic receipts?*
> 
> *Today, I'm excited to demonstrate `mermail-solana-revenue-agent`, a production-ready Mermail Agent Skill that bridges Mermail Agent Inbox and Mermail PayBox on the Solana blockchain."*

### 0:30 - 1:15 | Architecture & Security Guardrails
> **[Screen: VS Code / SKILL.md & Sequence Flowchart]**
> *"Here is the skill structure in `skills/mermail-solana-revenue-agent`. We follow Mermail's strict zero-trust standards:
> 1. Inbound email triage with `scan_status` sanitization to prevent prompt injection.
> 2. Real-time Solana portfolio inspection via `paybox_get_portfolio`.
> 3. Strict spend envelopes and user authorization caps.
> 4. Hardware/passkey signing delegation via Mermail PayBox console handoffs.
> 5. End-to-end receipt generation with Solscan verification."*

### 1:15 - 2:00 | Live Execution Walkthrough
> **[Screen: Terminal showing Claude / OpenClaw executing the skill]**
> *"Let's see it in action. We trigger the agent with the prompt:
> `Scan my Mermail inbox for unread Solana invoices, verify the USDC-Solana transfer in PayBox, and email a payment confirmation.`
>
> 1. The agent calls `list_mailboxes` and `list_emails`, extracting a pending invoice for 50 USDC to wallet `9xQe...WzK`.
> 2. It checks PayBox readiness with `get_paybox_connection` and verifies our balance.
> 3. It constructs the transfer manifest and generates the secure PayBox signing handoff.
> 4. Once signed, the agent polls `paybox_get_request`, obtains the confirmed transaction hash, and dispatches an HTML receipt to the client via `reply_to_email`."*

### 2:00 - 2:30 | Conclusion & Impact
> **[Screen: Browser showing Solscan transaction & Mermail receipt email]**
> *"The transaction is settled on Solana, verified on Solscan, and the client receives an instant receipt. This unlocks fully autonomous AI commerce and automated bounty management on Solana.
> Check out our PR #152 on the `mermail-skills` repository!"*

---

## 🛠️ Step-by-Step Reproduction Guide

1. Configure Mermail MCP in your agent environment (`openclaw.json` or `claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "mermail": {
         "command": "npx",
         "args": ["-y", "@mermail/mcp-server"]
       }
     }
   }
   ```
2. Enable the `mermail-solana-revenue-agent` skill.
3. Authenticate PayBox via full OAuth profile:
   ```bash
   mermail login --profile oauth
   ```
4. Run the test prompt against your Mermail inbox.
