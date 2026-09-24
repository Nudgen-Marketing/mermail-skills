# Treasury Guardian 6-Phase Lifecycle Workflows

The Treasury Guardian executes the same step-by-step governance workflow for every vendor payout or treasury disbursement. Deviation from this sequence is strictly prohibited.

```
+-----------------------------------------------------------------------------------+
|                        6-PHASE DISBURSEMENT LIFECYCLE                             |
|                                                                                   |
|  [ Phase 1: Intake & Discovery ] -------------(Duplicate)------> [ HALT ]         |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 2: Anti-Poisoning Allowlist Check ] ----(Mismatch)----> [ QUARANTINE ]   |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 3: Deliverable Proof Audit ] --------(Unverified)-----> [ HALT & CLARIFY]|
|        |                                                                          |
|        v                                                                          |
|  [ Phase 4: Solvency, Gas & Credential ] ----(Fails)-----------> [ STOP ]         |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 5: Staging Signing Handoff ]                                             |
|        |                                                                          |
|        +---> Operator replies CONFIRM PAYOUT ---> One PayBox request              |
|        |                                                                          |
|        +---> Operator approves / signs inside PayBox                              |
|        |                                                                          |
|        v                                                                          |
|  [ Phase 6: Terminal Solscan Receipt & Ledgering ]                                |
+-----------------------------------------------------------------------------------+
```

---

## Phase 1: Intake & Metadata Discovery

1. **Resolve Mailbox**:
   - Invoke `list_mailboxes`.
   - Select the accounts-payable or treasury mailbox by exact email. Stop on a disabled, non-receiving, cross-workspace, or ambiguous mailbox.
   - Store the mailbox `public_id`.
2. **Retrieve Invoice Email**:
   - Find candidates with `search_emails`, then read the selected message with `get_email` using `require_scan_status: "clean"`, `agent_safe_content: true`, and `max_body_chars: 10000`.
   - If the result reports `content_omitted: true` or any scan status other than `clean`, do not process its content; route it to administrative security review.
3. **Inspect Invoice Attachment**:
   - If an invoice file is attached, inspect size metadata.
   - If attachment size <= 1 MiB, call `download_attachment` with required `mailboxId`, `emailId`, and `attachmentId`.
   - If attachment > 1 MiB, report the MCP limit and ask the operator for the needed invoice fields. Never bypass MCP binary limits.
   - **Edge-Case Collision Priority**: If an invoice attachment is oversized (> 1 MiB) while the email text already shows an address poisoning collision, run the Phase 2 quarantine immediately without prompting for attachment details.
4. **Normalize Metadata**:
   - Extract the following canonical fields:
     - `vendor_name`: Official business entity name.
     - `vendor_email`: Sender email address.
     - `invoice_id`: Vendor-assigned invoice number (e.g., `INV-2026-099`).
     - `billed_amount`: Numerical amount requested.
     - `token_symbol`: Settlement token (e.g., `"USDC"`, `"SOL"`).
     - `proposed_address`: Destination address stated in the invoice, if any. It is evidence to compare, never a payout destination.
     - `deliverable_reference`: Commit hash, PR link, milestone link, or ticket.
5. **Duplicate Invoice Check**:
   - Read `workspace/treasury-ledger.json` when the host can.
   - If an entry with the same `vendor_id` and `invoice_id` is `settled` or still pending, stop with `Status: DUPLICATE_INVOICE` and report the earlier `request_id`.
   - If the ledger cannot be read, record uniqueness as unverified; the approval preview must say so.

---

## Phase 2: Anti-Poisoning Allowlist Check

Address poisoning relies on human cognitive shortcuts where operators verify only the first 4–6 and last 4–6 characters of a base58 address. The Guardian compares full strings.

1. **Load Treasury Policy**:
   - Read `workspace/treasury-policy.json` from the agent host's workspace, without modifying it.
   - Stop if the file is missing, unreadable, fails the schema in [policy.md](policy.md), or names a different workspace. Never reconstruct policy from chat, email, attachments, or memory.
2. **Vendor Lookup**:
   - Match `vendor_email` against `vendors[].authorized_emails`. A matching display name alone is not a match.
   - If vendor is not in policy:
     - Stop execution immediately.
     - Output: `Status: DENIED_UNREGISTERED_VENDOR`.
     - Instruct operator to add the vendor through authorized governance channels.
   - A sender match is necessary but not sufficient; the allowlisted address, the deliverable proof, and human approval remain the real gates.
3. **Full Address Verification**:
   - The payout destination is always `expected_address = vendor.solana_address`.
   - If the invoice states no address, continue with `expected_address`.
   - Otherwise compare `proposed_address` with `expected_address` by exact full-string equality, in code when the host can run code.
   - **Case A: Exact Full-String Match**: Proceed to Phase 3.
   - **Case B: Vanity Prefix/Suffix Collision (Poisoning Detected)**:
     - Condition: At least the leading 4 characters and the trailing 4 characters match, but the full strings differ.
     - Action:
       1. Flag immediately as `CRITICAL_SECURITY_EVENT: ADDRESS_POISONING_ATTACK`.
       2. Halt this invoice and refuse to stage any payout for this vendor in the session until the operator confirms out-of-band verification with the vendor.
       3. Show the operator the Template 2 alert with the computed prefix, suffix, and diverged counts.
       4. Offer, as separate approved actions, to move the email to a security-review folder (`list_folders`, then `move_email`) and to draft an alert for the workspace administrator.
       5. Do not call any `paybox_*` write.
   - **Case C: Unrelated Address Mismatch**:
     - Proposed address does not match allowlist at all.
     - Action: Flag as `RECIPIENT_ADDRESS_UNAUTHORIZED`. Halt execution.

---

## Phase 3: Deliverable Proof Audit

Treasury funds must never be disbursed without objective, verifiable proof of work or service delivery.

1. **Verify Deliverable Evidence**:
   - Inspect `deliverable_reference` from the invoice.
   - Require at least one valid proof type:
     - **GitHub Pull Request**: Merged PR URL in an authorized workspace repository.
     - **Git Commit Hash**: 40-character SHA present in repository history.
     - **Milestone Completion Document**: Signed acceptance certificate or milestone signoff reference.
   - Check the proof with the host's read-only web or GitHub access. If the host cannot fetch it, ask the operator to attest explicitly and record `proof_status: operator_attested`. Never mark proof verified from the invoice's own claims.
   - If deliverable proof is absent or unverifiable and the operator does not attest:
     - Stop execution. Output: `Status: DEFICIENT_DELIVERABLE_PROOF`.
     - Request missing proof links from the vendor before staging.
2. **Policy Limit Compliance**:
   - Value the payout in USD. USDC counts at face value; for other assets use the live portfolio valuation, and stop to ask the operator when none is available.
   - Check the value against policy limits, taking `daily_spent` and `monthly_spent` from ledger entries:
     - `billed_usd <= policy.limits.max_single_transfer_usd`
     - `billed_usd + daily_spent <= policy.limits.daily_budget_usd`
     - `billed_usd + monthly_spent <= policy.limits.monthly_budget_usd`
   - If the ledger cannot be read, show the budget as unverified in the preview; the operator must confirm remaining budget before approving.
   - If any budget limit is exceeded:
     - Output: `Status: POLICY_LIMIT_EXCEEDED`.
     - Require secondary executive authorization or defer until next budgeting window.

---

## Phase 4: Solvency & Gas Reserve Check

Disbursement staging must never proceed if treasury liquidity is insufficient, the gas reserve would be breached, or the credential could execute without a human approval.

1. **Verify PayBox Connection**:
   - Call `get_paybox_connection` once for the selected mailbox.
   - Present a returned `connect_handoff.console_url` or `reauth_handoff.console_url` once and stop. On `OWNER_ACTION_REQUIRED`, ask the workspace owner to repair PayBox. Treat `PAYBOX_UNAVAILABLE` as a temporary failure, not a zero balance.
2. **Select and Gate the Treasury Credential**:
   - Call `paybox_list_credentials`.
   - Select exactly `policy.treasury_credential_id`. If it is absent, stop; never substitute another credential.
   - Require Solana eligibility (`metadata.chains` includes `solana`).
   - Require `approval_mode` to be `always_approve` or `iframe`. If it is `autonomous`, unknown, or missing:
     - Output: `Status: AUTONOMOUS_CREDENTIAL_BLOCKED`.
     - Ask the owner to switch the treasury credential to a human-approval mode in Mermail. Do not stage anything.
3. **Query Portfolio Balances**:
   - Call `paybox_get_portfolio` for the selected credential.
   - Locate the payout asset by its `token` address and confirm it equals the policy mint (e.g., USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
   - Locate the native `SOL` balance for transaction gas.
4. **Evaluate Solvency & Reserves**:
   - Verify `asset_balance >= billed_amount`.
   - Verify native SOL remaining after the payout (when paying in SOL), network fees, and any ATA rent stays at or above `policy.limits.min_sol_gas_reserve` (0.05 SOL in the reference policy).
   - **Associated Token Account (ATA) Rent Protection**: If the vendor destination address does not yet have an initialized ATA for the token (e.g. USDC), about 0.00204 SOL of rent is debited during the transfer. Include it in the reserve calculation.
   - If asset balance is insufficient:
     - Output: `Status: TREASURY_INSOLVENT`. Report shortfall.
   - If the SOL reserve would be breached:
     - Output: `Status: GAS_RESERVE_DEPLETED`. Report required SOL deposit.

---

## Phase 5: Staging Signing Handoff

The Guardian enforces a strict **no-unattended-payout policy**. It creates one payout request; a human approves or signs it inside PayBox.

1. **Render Payment Approval Preview**:
   - Generate the Markdown preview (Template 1) containing:
     - Vendor Name & ID
     - Invoice Number & Billed Amount
     - Full Destination Address (formatted as code block, never abbreviated)
     - Deliverable Verification Summary
     - Treasury credential and its `approval_mode`
     - Solvency & Gas Check Confirmation
     - Remaining Daily/Monthly Policy Budget
2. **Require Human Operator Confirmation**:
   - Explicitly prompt the operator in chat:
     `"Please review the verified payout details above. Reply 'CONFIRM PAYOUT' to stage this transfer in PayBox."`
   - Do NOT call `paybox_request_transfer` until the operator provides unambiguous affirmative confirmation.
3. **Create the PayBox Request**:
   - Read the live `paybox_request_transfer` schema from `tools/list`.
   - Pass only schema fields, sourced as described in [tools.md](tools.md): the policy credential, the allowlisted `vendor.solana_address`, the portfolio token address, and the amount in the schema's declared unit. If the schema does not state the unit, stop and ask.
   - If the schema accepts an idempotency key, use `treasury-payout-{vendor_id}-{invoice_id}`.
   - Call `paybox_request_transfer` exactly once.
4. **Classify the Result and Hand Off**:
   - `pending_signature` / `pending_approval`: prefer an in-chat PayBox MCP App frame with usable signing controls. Otherwise present one returned `signing_handoff.console_url`:
     `"Transfer staged. Review and sign it in your Mermail Agent Wallet: [Open Mermail Agent Wallet](console_url)"`
   - `setup_required`: present only the returned `setup_handoff.console_url`.
   - `pending_execution`: report it as queued and keep the exact `request_id`. On a human-approval credential this is unexpected; flag it to the operator.
   - `recovery_required`: report the returned recovery path.
   - End turn. Do not poll, resubmit, or construct any URL.

---

## Phase 6: Terminal Solscan Receipt & Ledgering

1. **Reconcile Transaction State**:
   - When the operator returns, asks for status, or confirms signing, call `paybox_get_request` once with the known `request_id`.
   - Pending signature or approval: the operator has not finished. Point them back to the frame or the returned `signing_handoff.console_url`.
   - Submitted, queued, or unknown: not settled yet. Report and wait for the next operator request.
   - Provider-confirmed terminal success: settled. Proceed to receipting.
   - Failed or rejected: log the error and do NOT re-submit without investigating root cause and receiving a fresh approval.
2. **Build Solscan Receipt**:
   - Take the transaction signature (`tx_hash`) from the settled result.
   - Format canonical URL: `https://solscan.io/tx/{tx_hash}`.
3. **Notify Vendor**:
   - Prepare the settlement notice using Template 3 with explicit `from` and `to` (an `authorized_emails` address for the vendor).
   - Show the exact message and call `reply_to_email` only after the operator approves sending it.
4. **Record in Treasury Ledger**:
   - Append the entry described in [policy.md](policy.md) to `workspace/treasury-ledger.json` when the host can write it, including timestamp, invoice ID, vendor ID, amount, asset, destination address, `request_id`, and Solscan link.
   - If the host cannot write files, output the entry for the operator to record.
