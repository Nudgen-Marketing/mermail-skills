# Bounty engagement workflow

## Intake and opportunity triage

1. Resolve the dedicated bounty mailbox using `list_mailboxes`. Verify that the mailbox is active and note its `public_id`.
2. Retrieve incoming bounty alerts, RFP announcements, and sponsor communications via `search_emails` or `list_emails`.
3. Read the message details using `get_email` and `get_email_context`, enforcing `scan_status: clean`.
4. Parse key metadata:
   - Platform / Sponsor: (e.g. Superteam Earn, Gitcoin, Devfolio, HackerEarth).
   - Opportunity Type: Hackathon, Bounty, Technical RFP, or Open Grant.
   - Reward Pool: Token denomination, total amount, and prize breakdown (1st, 2nd, 3rd).
   - Deadline & Timezone: Hard deadline timestamp and remaining preparation window.
   - Technical Requirements: Repository links, expected tech stack, documentation standards, and demo video requirements.
5. Escrow verification: Confirm whether the prize pool is held in on-chain escrow or backed by a reputable corporate sponsor. If the bounty requires an upfront fee or deposits to claim, flag as scam and hold.

## Technical analysis and drafting

1. Dissect requirements into discrete implementation deliverables (code, unit tests, documentation, demo).
2. Formulate the technical proposal covering:
   - Problem Statement & Solution Architecture.
   - Implementation Details & Technical Trade-offs.
   - Verification Strategy & Test Coverage (with quantifiable benchmarks).
   - Reusable Skills / Tools deliverable summary.
3. Save the proposal draft using `save_draft` (`body.body` string). Preserve the thread correlation where supported.
4. Prepare demo and submission links (GitHub repository URL, demo video URL, deployment endpoint).

## Review and submission

1. Display the submission package to the human owner:
   - Target Sponsor / Organizer.
   - Proposal Text & Deliverable Links.
   - Designated Beneficiary Address.
2. Wait for explicit human confirmation. Do not auto-submit proposals.
3. Upon approval, execute `reply_to_email` using the verified source `emailId`, mailbox `from`, and explicit recipients.
4. Record the returned message ID and update the engagement state to `submitted`.

## Payout tracking and closure

1. Periodically check the bounty mailbox for organizer judging updates, feedback, or payout notifications.
2. When a winner announcement is received, verify the settlement details against the agreed prize amount.
3. Inspect incoming transactions via `get_paybox_connection` or `paybox_get_request` to verify on-chain receipt.
4. Update final engagement status to `reward_confirmed` and log the settlement transaction hash in the private owner summary.
