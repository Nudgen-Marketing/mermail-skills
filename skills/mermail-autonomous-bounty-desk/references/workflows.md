# Bounty Desk Workflows

Detailed multi-step workflows for autonomous bounty triage, escrow verification, and milestone delivery.

## 1. Inbound RFQ & Bounty Discovery Sequence

1. Call `list_mailboxes` to identify the active agent mailbox.
2. Execute `search_emails` with query `bounty OR "request for quote" OR RFQ OR milestone`.
3. For each relevant message:
   - Verify `scan_status: clean`.
   - Extract client contact, project goals, timeline, and budget.
   - Tag email with `create_custom_label` (`rfq-triaged`).

## 2. Milestone Quote & Proposal Staging

1. Compute a structured milestone plan:
   - Phase 1: Architecture & Prototyping (50% USDC)
   - Phase 2: Implementation, Testing & Verification (50% USDC)
2. Prepare quote response via `save_draft`:
   - Include clear payment milestones, delivery formats, and PayBox deposit address.
3. Present full preview to user.
4. On user approval, execute `reply_to_email`.

## 3. PayBox Escrow Deposit Verification

1. Call `paybox_get_portfolio` or `get_agent_wallet_portfolio`.
2. Verify that the required USDC deposit balance has settled on-chain on Solana.
3. If deposit is verified, update label to `escrow-funded` and initiate task execution.

## 4. Work Delivery & Proof Packaging

1. Compile completed deliverables (code repository links, test suites, verified artifact hashes).
2. Call `save_draft` to prepare the delivery notification.
3. Present delivery preview to user.
4. Execute `reply_to_email` upon user authorization.

## 5. Settlement & Payout Proposal

1. When paying sub-agents or claiming milestone funds:
2. Prepare a PayBox transfer request using `paybox_request_transfer` with exact destination address, token (`USDC`), and amount.
3. Wait for user-authorized execution.
4. Log on-chain transaction signature in the delivery summary.
