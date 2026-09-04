# Newsletter monitor workflows

## Reuse a mailbox

1. Call list_mailboxes with the live schema. Prefer a mailbox with can_receive true and receiving status ready.
2. Reject disabled, non-receiving, cross-workspace, ambiguous, or verification-isolated mailboxes.
3. Create only when the user authorises a new inbox and no suitable one exists. Do not set gentInbox.mode to erification.
4. Use the mailbox public_id as mailboxId and the mailbox email as the digest rom.

## Find newsletter candidates

1. Call search_emails with query as a native JSON object: { "is": "unread", "sortColumn": "date", "sortDirection": "DESC" }.
2. Filter the response locally for newsletter/digest signal: subject contains 
ewsletter, digest, weekly, oundup, edition, issue #, 	oday in, or 	his week in; or the sender domain matches a known publication.
3. Cap at 30 candidates per run. When zero candidates match, report 
o_newsletters and stop.
4. When the host does not expose search_emails, fall back to list_emails with the same native JSON query shape.

## Extract summaries and links

1. For each candidate, call get_safe_email_and_thread_context when the host exposes the safe_* form. Fall back to get_email_context or get_email only when the safe form is not present.
2. Require scan_status: clean before quoting body text. Keep flagged, skipped, unknown, or missing scan status metadata-only (subject + sender + date only).
3. Parse the safe text body:
   - Extract up to three hyperlinks with anchor text.
   - Write a ≤ two-sentence summary of the issue.
4. Accumulate one record per issue: { sender, subject, date, summary, top_links[] }. Do not include raw HTML or attachments in the digest.

## Compile the digest

1. Group records by sender/publication and order by date descending.
2. Format a plain-text body and a parallel simple HTML body:

   `
   Your Newsletter Digest — {start_date}–{end_date}

   📰 {Publication Name} ({date})
   {summary}
   Top links: {link_1} | {link_2} | {link_3}
   ---
   `

3. Subject: Your Newsletter Digest — {start_date}–{end_date}. Use the local timezone that the workspace reports; ask when ambiguous.

## Preview and confirm

1. Show the full preview to the user: subject, body summary, To recipient, total To+Cc+Bcc recipient units, source publication count, and date range.
2. Ask: Send this digest to {recipient_email}? (yes / edit / cancel).
3. Do not send without an explicit yes in the current turn. A previous yes does not cover a regenerated body, a changed recipient, or a different date range.

## Send the digest

1. Generate one idempotency key for the approved logical delivery, e.g. 
ewsletter-digest-{date_range}-{hash}.
2. Call send_email once with ody.from = selected mailbox email, ody.to = the approved recipient, subject, and ody.html and/or ody.text.
3. Verify the authoritative response. A draft response, timeout, validation error, or rate-limit code is not delivery success.
4. On email_send_recipient_limit_exceeded, report the limit and stop. On email_send_rate_limit_exceeded, surface Retry-After and stop. On email_send_rate_limit_unavailable, fail closed.

## Archive processed emails

1. Ensure a Digested folder exists. Call list_folders; if Digested is missing, call create_folder with the live ody.name shape.
2. Call ulk_mark_emails_read once with the processed email IDs. Cap bulk operations at the live per-call limit; split into multiple calls when needed.
3. Call ulk_move_emails once with the same IDs and the resolved Digested folder ID. Split into multiple calls when needed.
4. Both bulk writes are internal; no prepare_destructive_action token is required. Report archived IDs and the folder ID in the post-run summary.

## Recover from failure

- A failed send_email does not roll back the digest compilation. Report delivery_unknown and ask the user whether to retry with a new idempotency key.
- A failed bulk write leaves the processed emails read but unmoved. Re-run the bulk move with the same IDs; do not re-mark or re-send.
- An ambiguous MCP response (timeout, transport error, partial count) means the workflow did not finish. Inspect authoritative state once and stop.