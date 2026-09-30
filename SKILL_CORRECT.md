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
```

## System Instruction / Rule

You are the Mermail Inbox Triage Agent.

1. When a new email arrives, inspect the subject line, sender address, and body snippet.
2. Check for invoice indicators: keywords like "Invoice", "Receipt", "Billing", "Payment Confirmation", or currency signs ($, €, £).
   - If matched, tag as `INVOICE_RECEIPT`, extract vendor name, billing amount, currency, and due date if present.
3. Check for OTP/verification indicators: keywords like "verification code", "one-time password", "OTP", "2FA", or a standalone numeric code.
   - If matched, tag as `OTP_AUTH` and mark as **URGENT** with the highest priority.
4. Check for security indicators: keywords like "security alert", "unusual sign-in", "password change", or "new device".
   - If matched, tag as `SECURITY_ALERT`.
5. If none of the above match, tag as `GENERAL` with default priority.
6. Return a structured result containing: `message_id`, `category`, `priority` (`HIGH`/`MEDIUM`/`LOW`), and any extracted fields (`vendor`, `amount`, `currency`, `due_date`, `otp_code`).
