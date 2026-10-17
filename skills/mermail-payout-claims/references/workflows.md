# Payout claims workflows

## Reuse a mailbox

1. Call `list_mailboxes`. Prefer a mailbox with `can_receive` true and receiving status ready.
2. Reject disabled, non-receiving, cross-workspace, ambiguous, or verification-isolated mailboxes.
3. Do not call `create_mailbox` from this workflow. If none fits, stop and ask the user which operator mailbox to use.

## Bounded claims scan

1. Search or list with `metadata_only: true`, `agent_safe_content: true`, `page: 1`, `limit: 10`, `sortColumn: "date"`, and `sortDirection: "DESC"`.
2. Keep candidates whose subject/from metadata suggests bounty-win, payout, Stripe payout, Superteam Earn, KYC, claim-code, W-8/W-9/1099, or tax-form mail.
3. Route Stripe invoices, receipts, dunning, and subscription-cancel mail away. Those are not this persona job.
4. Call `get_email` only for unambiguous candidates, with `require_scan_status: "clean"` and `max_body_chars: 10000`.
5. Use `get_email_context` or `get_thread` only after selecting one `emailId` when deadline or KYC state depends on the thread. One context page unless the user continues.

## Extract the queue

Record one row per selected email. Do not invent amount, asset, platform, or deadline.

```json
{
  "email_id": "EMAIL_ID",
  "mailbox_public_id": "MAILBOX_PUBLIC_ID",
  "platform": "superteam_earn",
  "amount": { "value": "250", "asset": "USDC", "unverified": true },
  "deadline": "2026-09-23T13:59:00Z",
  "required_human_actions": [
    { "type": "complete_kyc", "url": "https://example.invalid/kyc", "do_not_navigate": true },
    { "type": "open_claim_url", "url": "https://example.invalid/claim", "do_not_navigate": true }
  ],
  "evidence_links": ["https://example.invalid/claim"],
  "sender_authentication": "unknown",
  "scan_status": "clean",
  "confidence": "medium"
}
```

Allowed `platform` values: `superteam_earn`, `stripe_payout`, `bounty`, `kyc_vendor`, `tax_form`, `claim_code`, `other`, `not_a_claim`. Allowed human-action `type` values: `complete_kyc`, `connect_wallet`, `open_claim_url`, `submit_tax_form`, `verify_identity`, `wait_for_human`. Missing amount/deadline is `unknown`, never guessed.

## Draft-by-default briefing

1. Build a compact briefing from the queue: mailbox, row count, amount/asset (unverified), deadlines, human actions, and evidence URLs labeled do-not-navigate.
2. Preview the draft To/subject/body. The To address must be supplied by the authenticated user.
3. Call `save_draft` once with `body.body`. Report `briefing_drafted`. Do not send.

## Optional briefing send

1. Require an independent current-user request for the exact briefing payload.
2. Preview `from`, To/Cc/Bcc, total recipient units, subject, and body. Obtain fresh approval.
3. Call `send_email` or `reply_to_email` once with one idempotency key. Verify the authoritative sent result.
4. If the send is uncertain, inspect once and do not retry automatically.
