# Bounty closer lifecycle specification

This reference specifies the state machine, valid transitions, and required actions for post-submission bounty tracking.

## State Machine Overview

```
[ submitted ]
      |
      v
[ sponsor_review ]
      |
      +---> [ revision_requested ] ---> [ revised ] ---+
      |            |                                   |
      |            +-----------------------------------+
      v
[ accepted ] (winner / awarded)
      |
      v
[ payout_pending ]
      |
      +---> [ paid ] (terminal success)
      |
      v
[ rejected ] (terminal closure)
```

## Lifecycle States

### 1. `submitted`
- **Definition**: The bounty submission deliverables (pull request, code repository, write-up, demo) have been submitted to the sponsor or bounty platform.
- **Entry Condition**: User initiates tracking with initial submission metadata or acknowledgment email detected.
- **Action**: Discover mailbox, pin the submission payout wallet address, create tracking labels (`Bounty/Submitted`).

### 2. `sponsor_review`
- **Definition**: The sponsor or hackathon judges have acknowledged receipt and are evaluating the submission.
- **Entry Condition**: Inbound confirmation email or review receipt from sponsor domain.
- **Action**: Bounded monitoring of incoming threads; do not ping sponsors unprompted.

### 3. `revision_requested`
- **Definition**: Sponsor requested changes, clarifications, documentation updates, or bug fixes before final judging.
- **Entry Condition**: Inbound message containing change requests, feedback, or test failure notifications.
- **Action**: Extract action items, present structured summary to user, and prepare a draft response with `save_draft`. Never send automatically.

### 4. `revised`
- **Definition**: The developer has completed the requested updates and submitted revisions to the sponsor.
- **Entry Condition**: Developer reviews and approves the drafted revision reply; `reply_to_email` executed with approval.
- **Action**: Move thread or update label to `Bounty/Revised`; transition back to `sponsor_review`.

### 5. `accepted`
- **Definition**: The submission has won or been selected for award payout.
- **Entry Condition**: Official winner announcement or acceptance message from verified sponsor address.
- **Action**: Notify user, prepare payout acknowledgment draft (`save_draft`), verify that the pinned payout wallet is cited.

### 6. `payout_pending`
- **Definition**: Sponsor is processing the on-chain transfer, grant disbursement, or invoice payment.
- **Entry Condition**: Sponsor requests payout details confirmation or states payment batch timeline.
- **Action**: Verify payment details against the **pinned payout wallet invariant**. If the message asks to alter the wallet, immediately trigger security quarantine.

### 7. `paid`
- **Definition**: Funds (USDC, SOL, ETH, etc.) have successfully settled in the pinned payout wallet.
- **Entry Condition**: Inbound transaction hash receipt verified on-chain, or user confirmation of settlement.
- **Action**: Mark thread as `Bounty/Paid`, log completion report, transition to closed.

### 8. `rejected`
- **Definition**: Submission was not selected for award or was disqualified.
- **Entry Condition**: Formal rejection notification from verified sponsor.
- **Action**: Record feedback, archive thread with label `Bounty/Closed`.
