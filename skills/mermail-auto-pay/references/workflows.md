# Workflows

This document describes the end-to-end sequences for the `mermail-auto-pay` skill.

## Workflow 1: Invoice Scan

**Trigger:** User asks to check for unpaid invoices.

1. Call `list_mailboxes` to resolve the target mailbox `public_id`.
2. Call `list_emails` with `mailboxId` and `query: "is:unread newer_than:3d"`.
3. For each email in the response:
   a. Run invoice detection heuristics on `subject`, `from`, `body_preview`.
   b. Classify as `INVOICE`, `PAYMENT_REQUEST`, `NOT_AN_INVOICE`, or `UNCLEAR`.
   c. If `NOT_AN_INVOICE`, skip.
   d. If `UNCLEAR`, add to a "needs review" list.
4. For each `INVOICE` or `PAYMENT_REQUEST`:
   a. Call `get_email` to retrieve the full body and attachment list.
   b. Extract payment fields: payee_name, payee_wallet, amount, token, due_date, invoice_number, memo_reference.
   c. Assign a confidence score (HIGH/MEDIUM/LOW) based on extraction clarity.
5. Call `paybox_inspect` to get current wallet balances.
6. Present a summary table:

```
Detected Invoices
------------------
#1 | INV-2026-0042 | Acme Labs | 150.00 USDC | Due: Sep 1 | Confidence: HIGH
#2 | Unclassified | billing@x.com | ??? | Due: ??? | Confidence: LOW

Wallet Balance: 320.50 USDC
```

7. Ask the user which invoices to proceed with.

## Workflow 2: Pay Single Invoice

**Trigger:** User approves payment for a specific invoice.

1. Confirm the exact payment details with the user:
   - Payee wallet address
   - Token
   - Amount (amount_decimal)
   - Memo reference
2. Verify the payee wallet address format (base58, 32-44 chars, starts with a letter/number).
3. Call `paybox_inspect` to confirm sufficient balance.
4. If balance insufficient, report shortfall and ask whether to proceed with a partial payment or skip.
5. Present the final payment preview:

```
Payment Preview
----------------
From: <agent_wallet_address>
To:   9xK4...abc (Acme Labs)
Token: USDC
Amount: 150.00
Memo:  INV-2026-0042 payment
Balance After: 170.50 USDC

Approve? [yes/no]
```

6. On approval, call `paybox_request_transfer` with:
   - `to`: validated payee wallet
   - `token`: extracted token
   - `amount_decimal`: extracted amount
   - `memo`: invoice number + "payment"
7. Verify the response contains a `transaction_signature`.
8. Generate the reconciliation entry.
9. Optionally offer to send a confirmation email to the payee.

## Workflow 3: Batch Invoice Review

**Trigger:** User asks for a full reconciliation of recent invoices.

1. Follow Workflow 1 steps 1-5 to detect all invoices.
2. For each detected invoice, check if it has already been processed (compare email IDs against a session-level processed set).
3. Present a reconciliation table:

```
Reconciliation Report (Last 7 Days)
--------------------------------------
Email ID          | Invoice #     | Payee      | Amount  | Token | Tx Sig           | Status
abc-123-def       | INV-2026-0042 | Acme Labs  | 150.00  | USDC  | 5xK4...tx1       | PAID
def-456-ghi       | INV-2026-0043 | DevCo      | 75.50   | USDC  | -                | PENDING
ghi-789-jkl       | -             | Unknown    | ???     | ???   | -                | UNCLEAR
```

4. Offer actions: pay pending invoices, re-classify unclear ones, or export the report.

## Workflow 4: Auto-Pay with Threshold

**Trigger:** User sets an auto-pay threshold (e.g., "auto-pay anything under $50").

1. Follow Workflow 1 steps 1-5 to detect and validate invoices.
2. For each invoice with confidence HIGH and amount below the threshold:
   a. Skip the manual approval step.
   b. Execute `paybox_request_transfer` directly.
   c. Record the reconciliation entry.
3. For invoices above the threshold or with MEDIUM/LOW confidence:
   a. Present for manual review (same as Workflow 2).
4. Present a summary of auto-paid vs. manually-approved payments.

## Error Handling

| Error | Action |
|-------|--------|
| `list_emails` returns empty | Report "No unread emails in the selected period." |
| `get_email` fails for an email | Skip that email, log the error, continue with others |
| No payee wallet found in invoice | Classify as UNCLEAR, ask user for the wallet address |
| `paybox_inspect` shows insufficient balance | Report shortfall, ask user to fund wallet or skip |
| `paybox_request_transfer` returns `failed` | Do NOT retry. Report error details and ask user |
| `paybox_request_transfer` times out | Report as DELIVERY_UNKNOWN, suggest checking on-chain later |
| Amount extraction disagrees between subject and body | Flag as MEDIUM confidence, show both values, ask user |
| Email has image-based PDF attachment | Report "Could not parse attachment", ask user to confirm amount |