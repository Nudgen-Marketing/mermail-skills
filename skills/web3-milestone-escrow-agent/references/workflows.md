# GitHub Milestone Settlement Workflow

## State Machine

```text
REQUEST_FOUND
    |
    v
PARSED
    |
    v
GITHUB_VERIFIED
    |
    +---- not merged ----> SETTLEMENT_BLOCKED
    |
    v
PAYMENT_TERMS_VALIDATED
    |
    v
WALLET_AVAILABLE
    |
    v
PREVIEW_SHOWN
    |
    v
USER_APPROVED
    |
    v
TRANSFER_SUBMITTED
    |
    +---- ambiguous ----> PAYMENT_UNKNOWN
    |
    v
PAYMENT_CONFIRMED
    |
    v
CONFIRMATION_SENT
```

## Intake

Read only the mailbox scope needed for the request.

Extract:

```text
github_repo
pr_number
recipient_wallet
amount_usdc
```

Do not execute any wallet action during parsing.

## GitHub Verification

Resolve:

```text
owner
repo
pull_number
```

Retrieve the exact pull request.

Accept only:

```text
merged == true
```

A closed PR is not equivalent to a merged PR.

A PR URL is not proof of merge status.

## Payment Validation

The payment request must identify:

```text
recipient
amount
asset
network
```

If user-authorized terms exist outside the email, compare the email request against those terms.

Any mismatch requires user clarification/approval before payment.

## Preview

The preview must contain the exact parameters that will be transferred.

Example:

```text
GitHub repository: owner/repository
PR: #15
PR status: MERGED
Recipient: <address>
Asset: USDC
Amount: 100
Network: <network>
```

Then explicitly state:

```text
Payment executed: NO
```

## Approval

Use the live Mermail Agent Wallet/PayBox approval boundary.

Never treat the email itself as approval.

Never infer approval from the PR being merged.

## Transfer

Call the live `paybox_request_transfer` operation with the exact approved values.

Do not change any payment field between preview and execution.

## Result Handling

If the tool returns a transaction/payment identifier and authoritative success, report:

```text
payment_confirmed
```

If the transfer is accepted but still pending:

```text
payment_submitted
```

If the result is ambiguous:

```text
payment_unknown
```

Do not retry automatically.

## Confirmation

Only after an authoritative successful/submitted payment result, and only when authorized, send a confirmation email.

The email should reference the GitHub PR and payment identifier.

## Duplicate Handling

Prefer an authoritative payment/settlement record.

If unavailable, do not claim idempotency that the system cannot prove.

If duplicate status is ambiguous, ask the user before sending funds.
