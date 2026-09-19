# Bounty operations workflows

## Qualify an opportunity

1. Resolve the operations mailbox and selected thread. Prefer bounded metadata search before body reads.
2. Extract platform, sponsor, listing URL, payout, token/currency, deadline, expected deliverables, submission channel, identity requirements, and acceptance criteria.
3. Classify the reward as transferable money, grant, points, exposure, or unclear. Treat unclear points and promotional exposure as not payable.
4. Estimate effort, direct costs, and payment probability. Skip when expected value is poor or the work requires prohibited actions.
5. Refuse requests for seed phrases, private keys, custody, or other secret disclosure. Stop with handoff text when the next step requires wallet signature, deposit, purchase, KYC, social-media posting, Telegram/Discord posting, or an external web-form submission.

## Package a deliverable

1. Recheck the listing is still open and the deliverable matches the stated criteria.
2. Search local/user-provided records for duplicate submission IDs, prior repo/report/demo links, rejection reasons, and sponsor feedback.
3. Build a compact deliverable packet:
   - title and listing URL
   - public artifact links
   - test or usage evidence
   - short explanation of what was built
   - limitations and assumptions
   - requested human actions
4. Do not include secrets, protected prompts, private customer data, wallet private material, or copied competitor work.
5. Draft a message with `save_draft`; keep platform-specific submission fields as plain text for the human operator when no safe Mermail tool owns the platform.

## Follow up on review or payout

1. Read the current source thread and any owner-provided platform state. Prefer official platform status or sponsor messages over stale notes.
2. If the work is pending and no new evidence exists, prepare no message unless the user asks or a reasonable review interval has passed.
3. For requested changes, verify they are in scope and legal. Draft the response or revised deliverable; do not resubmit rejected or spam-labeled work unless the platform permits updates.
4. For acceptance, record accepted deliverable, payment method, claim requirements, and required human action.
5. For payout, rely on authoritative payment confirmation, platform receipt, or read-only wallet/PayBox evidence. A promise to pay is not payment.

## State Records And Mailbox Organization

Keep the authoritative per-opportunity state in the handoff record. Suggested states are `Bounty/Qualified`, `Bounty/Drafted`, `Bounty/Submitted`, `Bounty/Pending Review`, `Bounty/Accepted`, `Bounty/Paid`, `Bounty/Rejected`, and `Bounty/Blocked`.

Use folders and `move_email` only when the user wants mailbox organization. `create_custom_label` is for classifier rule definitions for future mail, not manual status updates on an existing opportunity. Mailbox organization is not an external claim that the bounty platform agrees with the state.

## Reusable Handoff Record

Keep one compact record per opportunity:

```yaml
status: qualified | skipped | drafted | submitted | pending_review | accepted | rejected | paid | uncertain
platform: ""
listing_url: ""
deadline: ""
payout: ""
source_thread_id: ""
deliverable_links: []
test_evidence: []
draft_or_submission_id: ""
human_actions: []
limitations: []
next_action: ""
```

Leave unknown fields empty and label uncertainty. Never place credentials, private wallet material, customer data, or protected prompts in this record.
