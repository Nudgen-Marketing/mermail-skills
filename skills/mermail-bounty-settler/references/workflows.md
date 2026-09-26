# Workflows for Bounty & Milestone Settlement

This document outlines the standard operational sequence for ingesting, validating, proposing, executing, and receipting task milestones.

## Milestone Settlement Lifecycle

```text
[Inbound Claim] ➔ [Intake Audit] ➔ [Proof-of-Work Verification] ➔ [Payout Preview] ➔ [User Approval] ➔ [PayBox Execution] ➔ [Receipt Sent]
```

### 1. Inbound Claim Intake

1. Scan the agent mailbox for incoming milestone or deliverable submissions using `list_emails` with `folder: "inbox"`.
2. Retrieve candidate message content using `get_email`.
3. Check `scan_status` to ensure no malware or phishing payloads are attached.

### 2. Proof-of-Work Verification

1. Inspect email headers and verify sender authentication (`sender_authentication.status === "pass"`).
2. Extract the contributor's submitted deliverable (Pull Request link, commit SHA, or documentation artifact).
3. Validate that the requested amount matches the bounty agreement.

### 3. Payout Proposal & Preview

1. Check PayBox connection status and available balance using `get_paybox_connection` and `paybox_get_portfolio`.
2. Formulate the exact payout parameters:
   - Recipient address (Solana SPL token address or EVM 0x address)
   - Asset symbol and decimal amount
   - Task / milestone identifier
3. Output the preview clearly in the chat:
   ```text
   MILESTONE SETTLEMENT PROPOSAL:
   - Contributor: developer@example.com
   - Milestone: PR #1248 (abi-registry test suite)
   - Recipient: DCSY48oa2HPJafXtePpE6Y6Zpv829LUBQDicikEUGnvJ (Solana)
   - Amount: 200.00 USDC
   - Status: Awaiting User Approval
   ```

### 4. Explicit User Approval & Execution

1. If the user explicitly approves:
   - Call `paybox_request_transfer` with the exact verified arguments.
   - Record the returned transaction hash / signature.
2. If the user rejects or requests edits:
   - Abort the transfer immediately.

### 5. Settlement Receipt Generation

1. Draft a proof-of-settlement receipt using `save_draft` on the email thread.
2. Include transaction signature, release timestamp, and milestone completion note.
3. Upon approval, dispatch the receipt to the contributor with `reply_to_email`.
