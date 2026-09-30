---
name: mermail-payguard
description: Safely process payment requests received through Mermail by reviewing the request, presenting the payment details to the user, requiring explicit approval, executing the approved transaction through the connected Mermail Agent Wallet, and returning a clear transaction receipt. Use when a user asks the agent to review, prepare, approve, or complete a payment request from their Mermail inbox.
license: MIT
metadata:
  author: Mermail community contributor
  version: "1.0.0"
---

# Mermail PayGuard

## What This Skill Enables

Mermail PayGuard turns a payment request received through a Mermail inbox into a controlled, user-approved wallet workflow.

The skill helps an AI agent:

1. Find a relevant payment request in the user's Mermail inbox.
2. Read and extract the payment details.
3. Validate that the request contains sufficient information.
4. Present the proposed transaction clearly to the user.
5. Wait for explicit user approval.
6. Execute the approved transaction using the connected Mermail Agent Wallet.
7. Return the transaction result and receipt.

The skill is designed to reduce accidental wallet actions by making user approval a mandatory step.

## Mermail Interaction

This skill requires a connected Mermail MCP environment with access to the user's Mermail inbox and, when a payment is approved, the user's Agent Wallet.

Before attempting a wallet action:

- Confirm that Mermail is connected.
- Use the available Mermail mailbox tools to locate the relevant payment request.
- Use the available wallet tools only after explicit user approval.
- Never assume that a payment request is approved merely because it appears in the inbox.

If the Mermail tools are not available, stop and tell the user that Mermail must be connected before this workflow can run.

## Safety Rules

These rules are mandatory:

1. Never send a payment without explicit user approval in the current conversation.
2. Never infer approval from phrases such as "looks good", "that's fine", or the existence of a payment request.
3. Before asking for approval, show:
   - recipient
   - amount
   - token or asset
   - network or chain, when available
   - relevant transaction details available from the wallet tool
4. If any critical transaction field is missing or ambiguous, ask the user to clarify before proceeding.
5. Never silently change the recipient, amount, asset, or network.
6. If the user changes any transaction detail, show the complete updated transaction summary and ask for approval again.
7. If the wallet reports an error, do not retry automatically when a duplicate transaction could occur.
8. Treat transaction hashes and wallet responses as receipts, not as proof that a transaction is finalized unless the connected wallet explicitly reports confirmation/finality.
9. Never expose private keys, seed phrases, authentication secrets, or other wallet credentials.
10. If the request appears suspicious, contradictory, or inconsistent, stop and ask the user to verify it.

## Workflow

### Phase 1 — Connect

Check whether the Mermail MCP connection is available.

If it is not available:

- Tell the user to connect Mermail.
- Do not continue to wallet execution.

### Phase 2 — Find the Request

Search the Mermail inbox for the payment request described by the user.

Prefer the most recent relevant request.

Extract:

- sender
- recipient
- amount
- token or asset
- network
- memo or reference
- message identifier
- any additional payment instructions

If multiple requests match, show the candidates and ask the user which one to process.

### Phase 3 — Validate

Check that the payment request contains enough information to prepare a transaction.

At minimum, identify:

- recipient
- amount
- asset/token

If the network is required by the wallet and is not clear, ask the user to specify it.

Do not guess missing payment information.

### Phase 4 — Prepare

Create a human-readable transaction summary.

Example:

Payment request found.

- Recipient: 0x...
- Amount: 0.001 ETH
- Network: Base
- Source: Mermail inbox
- Request reference: <message-id>

Ask:

"Do you explicitly approve this transaction?"

Do not execute the wallet action yet.

### Phase 5 — Require Approval

Accept approval only when the user clearly authorizes the transaction.

Examples of clear approval:

- "Approve"
- "Yes, send it"
- "Proceed with this payment"
- "Confirm the transaction"

If the user says "no", "cancel", or otherwise declines:

- Do not execute the transaction.
- Confirm that no payment was sent.

If the user changes the transaction:

- Re-display the complete transaction summary.
- Ask for approval again.

### Phase 6 — Execute

Only after explicit approval:

1. Call the connected Mermail Agent Wallet payment/transaction tool.
2. Use exactly the approved recipient, amount, asset, and network.
3. Do not modify transaction parameters.
4. Record the returned transaction identifier or hash.
5. If the wallet reports failure, report the failure and do not automatically retry.

### Phase 7 — Confirm

Return a concise receipt.

Example:

Payment submitted successfully.

- Recipient: 0x...
- Amount: 0.001 ETH
- Network: Base
- Transaction: 0x...
- Status: submitted

If the wallet provides a confirmed/finalized status, report that exact status.

If confirmation is not available, do not claim that the transaction is finalized.

## Example Prompts

### Example 1 — Find and prepare

User:

"Check my Mermail inbox for a payment request from Alice and prepare it for me."

Expected behavior:

- Connect to Mermail.
- Find Alice's payment request.
- Extract the payment details.
- Display the transaction summary.
- Ask for explicit approval.
- Do not send anything yet.

### Example 2 — Approve

User:

"Approve it and send the payment."

Expected behavior:

- Confirm that the approval applies to the exact transaction currently displayed.
- Execute the transaction using the connected Mermail Agent Wallet.
- Return the wallet result and transaction receipt.

### Example 3 — Cancel

User:

"Cancel the payment."

Expected behavior:

- Do not execute the wallet transaction.
- Confirm that the payment was not sent.

### Example 4 — Missing information

User:

"Pay the request in my Mermail inbox."

Expected behavior:

- Find the request.
- If recipient, amount, asset, or required network information is missing, ask for clarification.
- Never guess the missing value.

## Expected Result

A successful run produces:

1. A payment request identified from Mermail.
2. A clear transaction summary.
3. Explicit user approval.
4. A wallet transaction using the approved details.
5. A transaction identifier or wallet receipt.
6. A clear final status.

The workflow must remain safe even when the inbox contains ambiguous or incomplete payment requests.

## Error Handling

### Mermail unavailable

Tell the user that Mermail must be connected and stop.

### No payment request found

Tell the user that no matching payment request was found and ask whether they want to search using different criteria.

### Multiple requests found

Show enough identifying information for the user to select the correct request.

### Missing transaction details

Ask for the missing information. Do not guess.

### User rejects payment

Do not call the wallet execution tool.

### Wallet execution fails

Report the failure returned by the wallet. Do not automatically retry.

### Transaction submitted but confirmation unavailable

Report that the transaction was submitted and provide the transaction identifier if available. Do not claim finality without confirmation.

## Reusability

This skill can be reused for:

- invoice payments
- vendor payment requests
- reimbursement requests
- agent-to-agent payments
- subscription payment requests
- other structured payment requests delivered through Mermail

The same safety workflow should remain:

Mermail request → inspect → validate → summarize → explicit approval → wallet execution → receipt.

## Demo Workflow

For a live demonstration:

1. Connect the AI client to Mermail.
2. Show a payment request in the Mermail inbox.
3. Give the agent this prompt:

   "Check my Mermail inbox for a payment request. Prepare the payment and ask me for approval before sending."

4. Show the agent finding the request.
5. Show the transaction summary.
6. Approve the transaction explicitly.
7. Show the Agent Wallet execution.
8. Show the returned transaction result.
9. Show the final receipt.

The demonstration must use a real connected Mermail environment and must not claim a payment was completed unless the connected wallet actually reports the result.
