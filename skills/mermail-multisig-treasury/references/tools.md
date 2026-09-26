# Mermail Multisig Treasury Tool Map

## Inbox & Message Discovery

These tools run under standard Mermail MCP authentication to safely identify and isolate inbound disbursement proposals without executing external effects.

- `list_mailboxes`: Discover active organization or DAO mailboxes. Resolves stable `mailboxId` (`public_id`) for subsequent proposal and message queries.
- `search_emails`: Query incoming proposal messages using structured JSON criteria (e.g., sender, label, date window).
- `get_email`: Fetch the full RFC-822 parsed body, attachment descriptors, `scan_status`, and cryptographic `sender_authentication` (SPF, DKIM, DMARC).
- `get_email_context`: Read bounded previous thread exchanges to verify historical deliverable context or previous milestone agreements.

## Proposal Staging & Agent Wallet Governance

These tools operate under full-profile Mermail MCP OAuth to manage the deterministic transfer proposal lifecycle.

- `get_paybox_connection`: Probe connection health and identify active workspace credentials.
- `paybox_get_portfolio`: Audit treasury liquid balances across Circle USDC, native SOL, and native ETH. Validates disbursement coverage and gas reserves.
- `create_agent_wallet_transfer_proposal`: Deterministically stage a local transfer proposal (`mailboxId`, `chain`, `amount`, `destination`). Reuses an existing matching `PENDING_REVIEW` proposal when available. Safe staging; does not debit funds or broadcast transactions.
- `submit_agent_wallet_transfer`: Submit an approved proposal for broadcast using `{ proposalId, version }`. Classified as wallet-destructive; strictly requires prior operator confirmation in chat.
- `reject_agent_wallet_transfer_proposal`: Explicitly cancel or reject an unapproved or invalid proposal (`proposalId`, `version`). Only operates on `PENDING_REVIEW` status.
- `paybox_request_transfer`: Standard PayBox transfer staging for direct payment flows using live-schema parameters. Surfaces the PayBox MCP App signing UI or console signing handoff.
- `paybox_get_request`: Reconcile terminal on-chain execution and settlement status using the original provider `request_id`.

## Multi-Signer Communication & Receipts

- `save_draft`: Prepare immutable sign-off review packets for co-signer review without immediate dispatch.
- `send_email`: Dispatch approved review notifications and quorum calls to registered treasury signers.
- `reply_to_email`: Deliver on-chain settlement receipts, transaction signatures, and block explorer verification links to the beneficiary.
