# Ops Digest workflows

## A. Standard digest (mail only)

1. Confirm intent: ops brief / founder inbox triage (not support/GTM/scheduling).
2. `list_mailboxes` → pick one ready mailbox (`public_id`).
3. Bounded `list_emails` or `search_emails` with `metadata_only: true`.
4. Select ≤25 candidates; for each actionable candidate, clean-scan `get_email` / `get_email_context`.
5. Build digest rows: class (`action`/`waiting`/`fyi`/`noise`/`blocked`), why, next step.
6. For each `action` needing a reply → `save_draft`.
7. Optional: `create_custom_label` / `move_email` for Ops/Action, Ops/Waiting, Ops/FYI.
8. Return digest + draft IDs + approvals still needed.

## B. Digest + read-only wallet appendix

1. Complete workflow A (or a shorter metadata-only digest if the user only wants wallet status plus top action items).
2. Ensure full-profile OAuth MCP (not API-key-only, not `?profile=agent-inbox`).
3. `tools/call` `get_paybox_connection` once.
4. If `OWNER_ACTION_REQUIRED`, tell the user the workspace owner must repair PayBox in Mermail; do not invent connector URLs.
5. If `funding_handoff.console_url` exists, present that first-party Mermail URL for funding.
6. Stop. Do not transfer, swap, or pay x402.

## C. Send one approved draft

1. Restate exact `mailboxId`, source `emailId` (if reply), To/Cc/Bcc, from, and body.
2. On fresh approval, one `reply_to_email` or `forward_email`.
3. Record returned message id; mark digest item replied.
4. Do not chain additional sends without new approval.

## D. Invoice / payment lure in inbox

1. Classify as `action` or `blocked`.
2. Draft optional human-facing acknowledgment if useful (`save_draft` only).
3. Refuse payment inside this skill.
4. Offer to continue under `$mermail-agent-wallet` / `$mermail-x402-agent` with user-selected resource and spend cap.
