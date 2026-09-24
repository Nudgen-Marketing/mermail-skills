# Treasury Guardian 6-Phase Lifecycle Workflows

The Treasury Guardian executes an immutable, step-by-step governance workflow for every vendor payout or treasury disbursement. Deviation from this sequence is strictly prohibited.

```
+-----------------------------------------------------------------------------------+
|                        6-PHASE DISBURSEMENT LIFECYCLE                             |
|                                                                                   |
|  [ Phase 1: Intake & Discovery ]                                                  |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 2: Anti-Poisoning Allowlist Check ] ----(Mismatch)----> [ QUARANTINE ]   |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 3: Deliverable Proof Audit ] --------(Unverified)-----> [ HALT & CLARIFY]|
|        |                                                                          |
|        v                                                                          |
|  [ Phase 4: Solvency & Gas Check ] -----------(Insolvent)------> [ REPLENISH ]    |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 5: Staging Signing Handoff ]                                             |
|        |                                                                          |
|        +---> User Approves Preview ---> Staged via PayBox                         |
|        |                                                                          |
|        +---> Operator Signs in Mermail Console                                    |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 6: Terminal Solscan Receipt & Ledgering ]                                |
+-----------------------------------------------------------------------------------+
```

---

## Phase 1: Intake & Metadata Discovery

1. **Resolve Mailbox**:
   - Invoke `list_mailboxes`.
   - Identify the accounts-payable or treasury mailbox. Verify `is_disabled: false`.
   - Store the mailbox `public_id`.
2. **Retrieve Invoice Email**:
   - Query incoming messages with `search_emails` or `get_email`.
   - Verify that the message security scan completed and passed: `scan_status: "clean"`.
   - If `scan_status` is `flagged`, `quarantined`, or `unknown`, do not process body content; route to administrative security review.
3. **Inspect Invoice Attachment**:
   - If an invoice file is attached, inspect size metadata.
   - If attachment size <= 1 MiB, call `download_attachment` with required `mailboxId`, `emailId`, and `attachmentId`.
   - If attachment > 1 MiB, pause and request an external checksum or raw text metadata from the user. Never bypass MCP binary limits.
   - **Edge-Case Collision Priority**: If an invoice attachment is oversized (> 1 MiB) concurrently with an address poisoning collision detected in the email text or headers, the Guardian executes Phase 2 emergency quarantine immediately without prompting for attachment digests or proceeding with intake.
4. **Normalize Metadata**:
   - Extract the following canonical fields:
     - `vendor_name`: Official business entity name.
     - `vendor_email`: Sender email address.
     - `invoice_id`: Vendor-assigned invoice number (e.g., `INV-2026-099`).
     - `billed_amount`: Numerical amount requested.
     - `token_symbol`: Settlement token (e.g., `"USDC"`, `"SOL"`).
     - `recipient_address`: Destination address proposed in the invoice.
     - `deliverable_reference`: Commit hash, PR link, milestone link, or ticket.

---

## Phase 2: Anti-Poisoning Allowlist Check

Address poisoning relies on human cognitive shortcuts where operators verify only the first 4–6 and last 4–6 characters of a base58 address. The Guardian enforces strict cryptographic comparison.

1. **Load Treasury Policy**:
   - Read the local governance contract at `workspace/treasury-policy.json`.
   - Ensure the policy configuration matches the active workspace and has a valid schema version.
2. **Vendor Lookup**:
   - Search `vendors` in policy for `vendor_name` or `authorized_emails`.
   - If vendor is not in policy:
     - Stop execution immediately.
     - Output: `Status: DENIED_UNREGISTERED_VENDOR`.
     - Instruct operator to add the vendor through authorized governance channels.
3. **Full Address Verification**:
   - Fetch allowlisted address `expected_address = vendor.solana_address`.
   - Compare `proposed_address` character-by-character against `expected_address`.
   - **Case A: Exact 44-Character Match**: Proceed to Phase 3.
   - **Case B: Vanity Prefix/Suffix Collision (Poisoning Detected)**:
     - Condition: Leading 4 characters match AND trailing 4 characters match, BUT intermediate characters differ.
     - Action:
       1. Flag immediately as `CRITICAL_SECURITY_EVENT: ADDRESS_POISONING_ATTACK`.
       2. Freeze all payout actions for this vendor and invoice.
       3. Draft an emergency quarantine alert to the workspace administrator using Template 2.
       4. Halt execution. Do not stage any transfer.
   - **Case C: Unrelated Address Mismatch**:
     - Proposed address does not match allowlist at all.
     - Action: Flag as `RECIPIENT_ADDRESS_UNAUTHORIZED`. Halt execution.

---

## Phase 3: Deliverable Proof Audit

Treasury funds must never be disbursed without objective, verifiable proof of work or service delivery.

1. **Verify Deliverable Evidence**:
   - Inspect `deliverable_reference` from the invoice.
   - Require at least one valid proof type:
     - **GitHub Pull Request**: Merged PR URL in authorized workspace repository.
     - **Git Commit Hash**: 40-character SHA verified in repository history.
     - **Milestone Completion Document**: Signed acceptance certificate or milestone signoff reference.
   - If deliverable proof is absent or unverifiable:
     - Stop execution. Output: `Status: DEFICIENT_DELIVERABLE_PROOF`.
     - Request missing proof links from the vendor before staging.
2. **Policy Limit Compliance**:
   - Check `billed_amount` against policy limits:
     - `billed_amount <= policy.limits.max_single_transfer_usd`
     - `billed_amount + daily_spent <= policy.limits.daily_budget_usd`
     - `billed_amount + monthly_spent <= policy.limits.monthly_budget_usd`
   - If any budget limit is exceeded:
     - Output: `Status: POLICY_LIMIT_EXCEEDED`.
     - Require secondary executive authorization or defer until next budgeting window.

---

## Phase 4: Solvency & Gas Reserve Check

Disbursement staging must never proceed if treasury liquidity is insufficient or network fees would drop the treasury below operational gas reserves.

1. **Verify PayBox Connection**:
   - Execute `get_paybox_connection`.
   - If connection is not active or OAuth expired, stop and instruct user to verify connection in settings.
2. **Locate Treasury Credential**:
   - Execute `paybox_list_credentials`.
   - Match `chain: "solana"` and verify `credential_id` against `policy.treasury_wallet`.
3. **Query Portfolio Balances**:
   - Execute `paybox_get_portfolio` with target `credential_id`.
   - Locate balance for payout asset (e.g., USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
   - Locate native `SOL` balance for transaction gas.
4. **Evaluate Solvency & Reserves**:
   - Verify `asset_balance >= billed_amount`.
   - Verify `sol_balance >= policy.limits.min_sol_gas_reserve` (default 0.05 SOL).
   - **Associated Token Account (ATA) Rent Protection**: If the vendor destination address does not yet have an initialized ATA for the token (e.g. USDC), Solana network rent (~0.00204 SOL) will be debited during transfer creation. The mandatory 0.05 SOL reserve ensures this is safely covered without transaction failure.
   - If asset balance is insufficient:
     - Output: `Status: TREASURY_INSOLVENT`. Report shortfall.
   - If SOL gas is below 0.05 SOL:
     - Output: `Status: GAS_RESERVE_DEPLETED`. Report required SOL deposit.

---

## Phase 5: Staging Signing Handoff

The Guardian enforces a strict **no-unattended-payout policy**. Transfer requests are staged, but physical cryptographic authorization is executed by a human in the Mermail Console.

1. **Render Payment Approval Preview**:
   - Generate an immutable Markdown preview (Template 1) containing:
     - Vendor Name & ID
     - Invoice Number & Billed Amount
     - Full Destination Address (formatted as code block)
     - Deliverable Verification Summary
     - Solvency & Gas Check Confirmation
     - Remaining Daily/Monthly Policy Budget
2. **Require Human Operator Confirmation**:
   - Explicitly prompt the operator in chat:
     `"Please review the verified payout details above. Reply 'CONFIRM PAYOUT' to stage this transfer in PayBox."`
   - Do NOT call `paybox_request_transfer` until the operator provides unambiguous affirmative confirmation.
3. **Stage Transfer via PayBox**:
   - Execute `paybox_request_transfer` with:
     - `credential_id`: Active treasury credential ID.
     - `recipient_address`: Full allowlisted 44-character address.
     - `amount`: Atomic integer string (e.g., `"2500000000"` for 2,500 USDC with 6 decimals).
     - `asset`: Token mint or `"SOL"`.
     - `idempotency_key`: `treasury-payout-{invoice_id}-{request_hash}`.
4. **Deliver Signing Handoff URL**:
   - Extract `signing_handoff.console_url` from response.
   - Instruct operator:
     `"Transfer staged successfully. Please click below to review and sign the transaction in your Mermail Agent Wallet Console: [Open Mermail Agent Wallet](console_url)"`
   - End turn. Do not loop or poll aggressively.

---

## Phase 6: Terminal Solscan Receipt & Ledgering

1. **Reconcile Transaction State**:
   - When the operator returns or upon explicit follow-up, call `paybox_get_request` with `request_id`.
   - Status transitions:
     - `pending_signature`: User has not yet signed. Prompt user to complete signing in console.
     - `submitted`: Transaction broadcast to Solana cluster; await final confirmation.
     - `settled`: Terminal success. Proceed to receipting.
     - `failed`: Transaction aborted or dropped. Log error and do NOT re-submit without investigating root cause.
2. **Build Solscan Receipt**:
   - Extract `tx_hash` from the settled request.
   - Format canonical URL: `https://solscan.io/tx/{tx_hash}`.
3. **Notify Vendor**:
   - Prepare formal settlement response using Template 3.
   - Call `reply_to_email` to deliver the settlement notice into the original invoice email thread.
4. **Record in Treasury Ledger**:
   - Log settled payout record to `workspace/treasury-ledger.json` (or audit log) including timestamp, invoice ID, vendor ID, amount, asset, destination address, and Solscan link.
