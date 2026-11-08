# Portfolio & Smart Inbox Assistant Skill for Mermail

## Overview
This skill empowers AI agents to monitor user wallet activity, track upcoming token unlocks, and automatically send structured portfolio summaries and transaction alerts directly to the user's Mermail Inbox using Model Context Protocol (MCP).

## How it Interacts with Mermail
- **Agent Wallet / MCP:** Connects securely to the user's agent wallet to fetch recent balances and token status.
- **Mermail Inbox:** Formats the extracted data into clean, actionable notifications and pushes them directly into the Mermail inbox thread.

## Step-by-Step Workflow
1. **User Prompt:** The user asks the AI agent to check wallet status and active token schedules.
2. **Data Retrieval:** The agent queries blockchain data via MCP and filters relevant token unlock events.
3. **Mermail Integration:** The agent formats the summary and uses the Mermail API/MCP tool to send the notification to the user's designated inbox channel.
4. **Final Delivery:** The user receives a clean, readable report directly inside Mermail.

## Example Prompts & Expected Outputs
- **Prompt:** "Check my portfolio status and send a summary report to my Mermail inbox."
- **Expected Output:** 
  > *[Mermail Notification Inbox]* 
  > 📊 **Portfolio Status Report:** 
  > - Sol Balance: 14.2 SOL
  > - Active Locks: 2 streams active
  > - Status: All secure. Next unlock in 4 days.
