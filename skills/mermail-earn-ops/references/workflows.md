# Earn Ops workflows

## A. Bounded Earn inbox scan

1. `list_mailboxes` → choose one ready mailbox (`public_id`).
2. `search_emails` / `list_emails` with `metadata_only: true`, newest-first (`sortColumn: "date"`, `sortDirection: "DESC"`), limit ≤ 20.
3. Filter themes client-side: Earn, Superteam, bounty, sponsor, OTP, verification, payout, submission.
4. For each clean candidate needing body: `get_email` or `get_email_context`.
5. Emit classification table: action / ignore / escalate_to_human + reason.
6. Do not send. Optionally `save_draft` for action items.

## B. Draft reply in builder voice

1. Confirm thread id and intended `to`.
2. Draft short, concrete copy (no invented PR/video/submission URLs).
3. `save_draft` with `body.body` string.
4. Present preview. Wait for explicit approval.
5. Only then `reply_to_email` with `body.from` = Mermail mailbox email.

## C. OTP / login code surface

1. Search recent mail for OTP / verification / login code subjects.
2. Exclude pre-wait baseline ids if monitoring a fresh login.
3. `get_email` with `agent_safe_content: true`.
4. Surface code + sender + time to the user.
5. Do not open links, do not forward OTP, do not enter codes into sites.

## D. Escalate money / ID / passkey

1. Classify `escalate_to_human`.
2. Summarize non-secret why (payout request, KYC, passkey, Boost paywall).
3. `forward_email` or `save_draft` to the human owner.
4. Optional label `Earn/Escalate`.
5. Never call PayBox writes.

## E. Read-only Agent Wallet check

1. Confirm user asked for inspect-only (or balance context for a bounty payout discussion).
2. `tools/call` `get_paybox_connection` once.
3. If `OWNER_ACTION_REQUIRED`, stop and ask workspace owner to repair PayBox in Mermail.
4. If usable/`ACTIVE`, `paybox_get_portfolio`.
5. Report balances. Any transfer/swap/x402 ask → escalate; do not execute.

## F. Optional draft-only triager

1. `list_task_triagers` / `list_recent_triager_runs`.
2. `create_task_triager` or `update_task_triager` for classification + auto-draft only.
3. Never let triager authorize send, delete, or PayBox.
4. Do not call `set_default_task_triager`.
