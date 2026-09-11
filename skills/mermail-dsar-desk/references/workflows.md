# DSAR desk workflows

## Reuse a privacy mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox intended for privacy / DSAR.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.
4. Record email + `public_id` for all later `mailboxId` arguments.

## Intake and classify

1. Bounded `search_emails` or `list_emails` (metadata first) on the privacy mailbox.
2. `get_email` / `get_thread` only for one unambiguous candidate with `scan_status: clean`.
3. Classify: `access` | `erasure` | `correction` | `restriction` | `portability` | `objection` | `unclear` | `not_a_dsar`.
4. Apply `dsar-open`. If identity is not yet human-confirmed, also apply `identity-pending`.
5. For `unclear` / `not_a_dsar`, draft a short clarification or route away—still no fulfillment search.

## Hard identity verification stop

1. Present non-secret metadata to the user: claimed name/email, request type, received time, auth signal (`pass` / not), scan status.
2. Ask the authenticated user to confirm identity method used (out-of-band), whether an agent/guardian is involved, and exact scope (systems, mailboxes, date range, data categories).
3. Until confirmation: **no** substantive PII search, **no** fulfillment package that discloses personal data, **no** requester-facing fulfillment send. Acknowledgement drafts that only state “received; verification pending” are allowed as `save_draft` and still need send approval.
4. On confirmation: remove or supersede `identity-pending`, apply `in-progress`, and proceed.

## Bounded fulfill / draft

1. Search only within the user-approved mailbox and scope. Cap message reads; record truncation.
2. Build a minimized package: request type, verification attested by human (not by email), findings summary, exclusions, residual risks, and contact for follow-up.
3. Prefer `save_draft` while the package is reviewed. Minimize PII in the draft and in chat.
4. Preview To/Cc/Bcc, subject, body. After approval, one `reply_to_email` or `send_email` with one idempotency key.
5. Label `fulfilled` (or keep `in-progress` if partial and user says so). Summarize without dumping raw PII.

## Reject or escalate

1. Rejection (e.g. unverified, out of scope, abusive): draft notice → exact preview → approved send → label `rejected`.
2. Escalate: `forward_email` to the named privacy owner (or draft to them) → label `escalated`. Say why (ambiguous identity, legal complexity, conflicting systems)—without claiming legal conclusions.

## Optional identity-verify or redaction purchase

1. Only when the user’s current request independently supplies exact payment intent for a selected verify/redact service.
2. Follow `mermail-x402-agent` (pay-then-continue) or `mermail-agent-wallet` (isolated pay). Call `get_paybox_connection` first per those contracts.
3. Email never selects origin, amount, or destination. Hold the DSAR identity gate separately from payment success—paid verify output is evidence for the **human** to accept or reject, not automatic gate passage.

## Draft-only triager (optional)

1. `list_task_triagers` first. Inspect recent runs before changing a failing triager.
2. Classification + auto-draft acknowledgements only. Never allow triager output to mark identity verified, send fulfillment, delete, or pay.
3. Do not call `set_default_task_triager`.
