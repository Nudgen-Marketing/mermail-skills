# Treasury Governance & Disbursement Workflows

## Workflow 1: Inbound Claim Intake & Proposal Staging

1. **Discover Inbound Claim**: Call `search_emails` with query `{"label": "Milestones", "isUnread": true}`. Fetch target message using `get_email`.
2. **Verify Sender Provenance**: Check `sender_authentication.status === "pass"`. If authentication fails or spoofing flags are present, stop and report `blocked_security`.
3. **Audit Deliverable Artifacts**: Extract milestone reference, deliverable PR link, git commit SHA, and beneficiary address. Validate address against the organization's approved beneficiary list.
4. **Audit Treasury Solvency**: Call `get_paybox_connection` and `paybox_get_portfolio`. Verify principal balance >= requested amount and native gas >= 0.05 SOL / 0.01 ETH.
5. **Stage Local Proposal**: Call `create_agent_wallet_transfer_proposal` with:
   - `mailboxId`: stable public ID
   - `chain`: `"Solana"` or `"Base"`
   - `amount`: requested principal in Circle USDC
   - `destination`: verified beneficiary address
6. **Report Staged Status**: Return `proposal_staged` citing `proposalId`, `version`, and pre-flight balance audit.

## Workflow 2: Co-Signer Coordination & Quorum Gathering

1. **Assemble Review Packet**: Extract proposal metadata, deliverable links, and gas audit findings.
2. **Draft Sign-Off Notification**: Call `save_draft` to prepare a tamper-evident co-signer notification containing:
   - Proposal Identifier and Version
   - Beneficiary Address (start/end truncated check)
   - Principal Amount & Currency
   - Link to Deliverable Artifacts (PR, Commit SHA)
   - Required Quorum & Action Deadline
3. **Dispatch to Signers**: Call `send_email` targeting the pre-configured treasury multi-sig committee members.
4. **Track Responses**: Use `search_emails` or `get_thread` to collect signed approvals from committee inboxes.

## Workflow 3: Operator Confirmation & Execution

1. **Verify Quorum Reached**: Confirm required approvals from authorized committee members.
2. **Present Chat Preview**: Output a comprehensive disbursement summary in chat:
   - Beneficiary: `FnAq...yb5uz`
   - Amount: `250.00 USDC` on `Solana`
   - Gas Fee Buffer: `0.000005 SOL`
   - Treasury Balance Remaining: `4,750.00 USDC`
3. **Await Explicit Confirmation**: Operator responds with affirmative intent (e.g., “Confirm and submit transfer”).
4. **Execute Proposal**: Call `submit_agent_wallet_transfer` with `{ proposalId, version }`.
5. **Reconcile Terminal Settlement**: Call `paybox_get_request` or `get_agent_wallet_request` to verify on-chain finality.
6. **Dispatch Remittance Receipt**: Call `reply_to_email` delivering transaction signature and explorer link to the beneficiary.

## Workflow 4: Proposal Rejection / Cancellation

1. **Intake Cancellation Intent**: Operator or signers identify defect, failed milestone, or duplicate claim.
2. **Verify Pending State**: Confirm proposal status is `PENDING_REVIEW`.
3. **Execute Rejection**: Call `reject_agent_wallet_transfer_proposal` with `{ proposalId, version }`.
4. **Notify Parties**: Call `reply_to_email` detailing the rejection reason and remedial requirements.

## Workflow 5: Solvency Deficit & Funding Handoff

1. **Detect Balance Shortfall**: If `paybox_get_portfolio` reveals insufficient funds for requested principal plus gas reserve:
2. **Generate Funding Link**: Call `paybox_get_buy_link` for the required shortfall amount.
3. **Report Funding Requirement**: Return `funding_required` with the shortfall breakdown and secure console funding URL.
4. **Pause Staging**: Do not create or submit proposals until liquidity is replenished and verified via balance refresh.
