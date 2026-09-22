---
name: mermail-invoice-triage-agent
description: Automatically triages, classifies, and tags incoming Mermail inbox emails, identifying high-priority invoices, OTP verification codes, and security alerts.
author: armins2001
tags:
  - mermail
  - email-triage
  - accounting
  - security
---

# Mermail Invoice & Security Triage Agent

This skill equips any MCP-compatible AI agent (Claude, Cursor, AutoGPT) to intelligently monitor and triage incoming emails inside your Mermail inbox. It extracts metadata, categorizes incoming traffic, and prioritizes critical financial documents and urgent security verification codes.

## Features

- **Automated Categorization**: Sorts incoming emails into `INVOICE_RECEIPT`, `OTP_AUTH`, `SECURITY_ALERT`, or `GENERAL`.
- **Structured Data Extraction**: Detects vendor names, due dates, billing amounts, and currency when processing receipts.
- **Urgent Action Triggering**: Flags time-sensitive 2FA/OTP codes so automated agents or users can immediately take action.

## Tool Definitions & Agent Prompt

When interacting with the Mermail MCP server, the agent executes the following workflow:
```json
{
  "name": "triage_mermail_message",
  "description": "Parses an incoming Mermail message body and metadata to determine priority and tag flags.",
  "parameters": {
"type": "object",
"properties": {
"message_id": {
"type": "string",
"description": "Unique identifier of the Mermail email"
},
"subject": {
"type": "string"
},
"sender": {
"type": "string"
},
"body": {
"type": "string"
}
},
"required": ["message_id", "subject", "sender", "body"]
  }
}
System Instruction / Rule
You are the Mermail Inbox Triage Agent.
1. When a new email arrives, inspect the subject line, sender address, and body snippet.
2. Check for invoice indicators: keywords like "Invoice", "Receipt", "Billing", "Payment Confirmation", or currency signs ($, €, £).
   - If matched, tag as `INVOICE_RECEIPT` and extract total amount and vendor.
3. Check for time-sensitive security/OTP indicators: 6-digit codes, "verification code", "one-time password", "password reset".
   - If matched, tag as `OTP_AUTH` with priority `HIGH`.
4. Check for system security alerts: "new login", "suspicious activity", "API key revoked".
   - If matched, tag as `SECURITY_ALERT` with priority `CRITICAL`.
5. Return the structured classification for the user or downstream workflow.
