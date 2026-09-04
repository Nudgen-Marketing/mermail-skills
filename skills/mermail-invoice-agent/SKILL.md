---
name: mermail-invoice-agent
description: Audit incoming invoices from email, enforce spend policies and vendor allowlists, coordinate PayBox settlements, and deliver payment receipts.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🧾"
---

# Mermail invoice agent

## Overview

Use this skill when processing commercial invoices, vendor billing emails, or payment requests sent to a Mermail agent mailbox. This agent validates incoming bills against cryptographic sender authentication, enforces corporate spend limits and vendor allowlists, stages on-chain payments through PayBox or Agent Wallet, and sends formal payment receipts back to vendors.

Read [tools.md](references/tools.md) for tool definitions and query parameter conventions. Read [security.md](references/security.md) for strict intake validation and spend ceiling rules. Read [workflows.md](references/workflows.md) for end-to-step procedures covering accounts payable and receivable.

## Preferred deliverables

- Authenticated email inspection confirming SPF, DKIM, and DMARC alignment via `get_email_context`.
- Structured invoice extraction report detailing vendor identity, invoice number, line items, token amount, recipient wallet address, and payment terms.
- Policy compliance checklist validating recipient address against the verified vendor allowlist, confirming transaction velocity within daily limits, and checking against duplicate past payments.
- Pre-settlement transfer proposal formatted for operator review.
- On-chain transfer request submitted via `paybox_request_transfer` or `create_agent_wallet_transfer_proposal`.
- Automated receipt reply sent to vendor with transaction hash and block explorer link upon confirmation.

## Interaction budget

- Complete mailbox scanning, sender authentication checks, duplicate invoice queries, and portfolio balance verification without narrating each read step.
- Present a single comprehensive review summary to the operator containing all material invoice details before staging any financial transfer.
- Ask for clarification only when an invoice carries ambiguous amounts, conflicting token symbols, or an unlisted recipient address.
- Never execute financial disbursements automatically without explicit operator consent.

## Workflow

1. Scan unread messages in the invoice intake mailbox with `list_emails`.
2. Inspect sender domain authentication with `get_email_context`. Verify `sender_authentication.status === 'pass'`. If authentication fails or is unknown, mark the message as suspicious and halt processing.
3. Retrieve email text and attachment data with `get_email`. Parse structured invoice fields: vendor name, invoice reference ID, billing amount, token denomination, recipient chain and address, and payment due date.
4. Execute duplicate detection by searching past messages with `search_emails` using the invoice reference ID. If previously settled, flag as duplicate and stop.
5. Check recipient address against the operator-approved vendor allowlist.
6. Verify wallet funding status with `get_paybox_connection` and `get_agent_wallet_portfolio`. Ensure sufficient balance exists for the requested settlement plus estimated transaction fees.
7. Present exact settlement terms to the operator: vendor name, invoice number, amount, token symbol, destination address, and network.
8. Upon operator approval, invoke `paybox_request_transfer` or `create_agent_wallet_transfer_proposal` to initiate the transfer.
9. After transaction broadcast and confirmation, compose and send an itemized receipt to the vendor using `reply_to_email` or `send_email`. Include the transaction hash, settled amount, and timestamp.
10. Update the email status label to `invoice-paid` using `update_email`.

## Write safety

- External effects: Sending confirmation emails with `send_email` or `reply_to_email` requires operator preview.
- Financial transfers: Every wallet write (`paybox_request_transfer`, `create_agent_wallet_transfer_proposal`) is an external financial action requiring explicit operator signing.
- Reversible writes: Updating email labels or saving draft replies can proceed automatically within configured workflows.
- Destructive actions: Archiving or trashing invoices requires explicit operator confirmation and `prepare_destructive_action` token.

## Example requests

- "Check the inbox for new vendor invoices and prepare settlement proposals for any approved bills."
- "Audit invoice #INV-2026-88 from Acme Hosting, verify their Solana address on our allowlist, and stage payment from PayBox."
- "Review incoming contractor invoices this week, ensure DKIM passed, and send receipts for all settled items."
