---
name: ph-bounty-hunter
description: Scans Mermail inbox for freelance bounty emails, extracts tasks, and auto-pays via Agent Wallet on Solana
---

# PH Bounty Hunter Skill

## What This Skill Enables
Enables AI agents to act as a freelance bounty hunter for Port Harcourt/Nigeria freelancers. Agent scans inbox for bounty/task emails, extracts payment details, and uses Mermail Agent Wallet to pay freelancers via Solana x402.

Perfect for Gibwork, Superteam, and other crypto freelance platforms.

## How It Interacts With Mermail
- **Inbox**: Uses `mermail_list_emails` and `mermail_search_emails` to find unread emails with keywords: "bounty", "gig", "task completed", "payment"
- **Agent Wallet**: Uses `paybox_request_transfer` and `mermail-x402-agent` to execute Solana payments
- **Compose**: Uses `mermail_send_email` to send payment confirmation back to freelanc