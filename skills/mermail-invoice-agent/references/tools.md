# Tools Reference for Mermail Invoice Agent

This document lists the tools used by `mermail-invoice-agent` across Mermail mailbox management and Agent Wallet / PayBox domains.

## Inbox Discovery & Message Management

| Tool | Purpose | Primary Parameters |
| :--- | :--- | :--- |
| `list_mailboxes` | Discover available workspace mailboxes | `workspaceId` (optional) |
| `search_emails` | Query messages matching invoice/billing criteria | `mailboxId`, `q`, `limit` |
| `get_email` | Read exact invoice email body and metadata | `emailId`, `mailboxId` |
| `get_email_context` | Read bounded thread context for the invoice | `emailId`, `mailboxId`, `limit` |
| `download_attachment` | Retrieve attached PDF/CSV invoices | `emailId`, `attachmentId` |
| `move_email` | Archive settled invoice thread to Finance folder | `emailId`, `folderId` |

## Wallet & Payment Operations

| Tool | Purpose | Primary Parameters |
| :--- | :--- | :--- |
| `get_agent_wallet_portfolio` | Inspect on-chain token balances | `walletId` |
| `paybox_get_portfolio` | Inspect PayBox balances and supported assets | None |
| `create_agent_wallet_transfer_proposal` | Formulate a formal transfer proposal for review | `walletId`, `recipient`, `amount`, `token` |
| `paybox_request_transfer` | Execute on-chain token transfer | `recipient`, `amount`, `asset` |
| `paybox_pay_x402` | Settle HTTP 402 machine payment requests | `url`, `quoteId`, `amount` |

## Vendor Communication

| Tool | Purpose | Primary Parameters |
| :--- | :--- | :--- |
| `save_draft` | Save an invoice payment confirmation draft | `emailId`, `body`, `subject` |
| `reply_to_email` | Send payment receipt directly to the vendor | `emailId`, `body`, `attachments` |