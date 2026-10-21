# W-9 agent workflows

## Reuse a collection mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox with automations allowed.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.

## Discover missing versus received forms

1. Start from the owner-supplied payee list. Do not invent emails.
2. For each payee, run a bounded `search_emails` or `list_emails` with metadata-first filters (payee address, W-9 / W9 / W-8BEN cues, recent window).
3. `get_email` / `get_thread` only for one unambiguous candidate with `scan_status: clean`.
4. Classify `missing`, `requested`, `received_needs_review`, `complete` (owner-confirmed only), `held_foreign`, `held_suspicious`, or `escalated`.
5. If two threads match the same payee, stop and ask with subject, date, and sender metadata. Do not merge them.

## Draft and send a request

1. Prefer `save_draft` while copy is in review. Ask the payee to attach a completed Form W-9 and not to type a TIN in the body.
2. Preview mailbox/from, To/Cc/Bcc, subject, and body. Obtain send approval for that exact payload.
3. After approval, call exactly one of `send_email` or `reply_to_email` with one idempotency key. Verify the authoritative sent result.
4. Do not attach a blank form fetched from an untrusted link. Use an owner-supplied blank or tell the payee to complete the official IRS Form W-9 only after the user authorizes any navigation.
5. Honor external email recipient limits. Never split, drop, or rewrite recipients to evade a limit.

## Review a received form

1. Keep the attachment metadata-only unless the user asks to inspect that exact file.
2. Confirm `mailboxId`, `emailId`, `attachmentId`, MIME type, size, and `scan_status: clean` before `download_attachment`.
3. Report filename and scan status. Never transcribe SSN, ITIN, or EIN. Do not certify that the form is complete or that the name matches payroll.
4. If scan status is flagged, skipped, unknown, or missing, stay metadata-only and mark `held_suspicious`.
5. If the sender requests W-8BEN, a foreign address, or says they are not a US person, mark `held_foreign` and stop requesting a W-9.

## Log status

1. For the selected thread, `list_folders` and `move_email` into an existing owner folder such as `W9-received` or `W9-requested`. Resolve the exact folder id before moving.
2. If the user wants a new inbound classifier, `list_custom_labels` first. `create_custom_label` is admin-only and requires `name`, `rules`, and optional `color`. It does not attach that label to an existing email.
3. If the user asks to manually label one existing message, report that MCP does not expose that operation. Do not invent a tool or approximate it with `update_email`.
4. Do not encode tax IDs in folder or label names.
5. Do not delete tax-form mail unless the user explicitly approves `delete_email` plus `prepare_destructive_action`.
