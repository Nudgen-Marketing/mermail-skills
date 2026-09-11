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
| `paybox_request_transfer` | Default entry point for every new native/token transfer; may return a signing handoff | Use the exact live tool schema |
| `paybox_pay_x402` | Create the payment proof for one frozen x402 request; proof creation alone does not prove redemption or settlement | Use the exact live tool schema and pass the resolved required charge |
| `paybox_get_request` | Reconcile one known pending or uncertain PayBox request | Use the exact request identifier returned by PayBox |
| `create_agent_wallet_transfer_proposal` | Legacy local Circle USDC proposal for explicit proposal-review workflows only; never a fallback for a normal send | `mailboxId`, `chain`, `amount`, `destination` |

## Vendor Communication

| Tool | Purpose | Primary Parameters |
| :--- | :--- | :--- |
| `save_draft` | Save an invoice payment confirmation draft | `emailId`, `body`, `subject` |
| `reply_to_email` | Send payment receipt directly to the vendor | `emailId`, `body`, `attachments` |

Pass all structured arguments as native objects, not stringified JSON. Prefer a mailbox `public_id` as `mailboxId`. Read every PayBox tool's live schema before use because provider fields can evolve.

PayBox requires the default full MCP profile and OAuth. API-key authentication and the focused agent-inbox profile do not expose PayBox. If a required `paybox_*` tool is absent, report it unavailable; do not substitute a proposal, a different transfer primitive, or a new payment request.
