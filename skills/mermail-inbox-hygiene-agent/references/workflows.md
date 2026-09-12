# Inbox hygiene agent workflows

## Reuse one mailbox

1. Call `list_mailboxes` and select one mailbox for the whole engagement.
2. Prefer a mailbox that can receive mail and is not verification-isolated; reject disabled, ambiguous, unavailable, or cross-workspace mailboxes.
3. Never provision a mailbox for cleanup work. If nothing fits, stop and say why.

## Audit senders with bounded reads

1. Page `list_emails` with `metadata_only: true`, `sortColumn: "date"`, `sortDirection: "DESC"`, and a `limit` inside the live schema (1-100).
2. Narrow with `search_emails` when the user names a sender, subject, folder, or date window. Filters establish candidates; they are not sender authentication.
3. Record per sender: message count, unread count, first and last date, and the folders already holding that mail.
4. Keep paging only while the user's question needs it, and say when a capped page count makes a total a floor.
5. Use `list_folders` and `list_custom_labels` to describe the current structure before proposing a new one.

## Build the exact-count plan

1. Freeze the id set per sender group, deduplicated, with the count shown next to it.
2. Choose one destination per group: an existing custom folder, or one new folder name that `create_folder` can slugify.
3. State the untouched remainder explicitly: senders outside the plan, starred mail, and any group the user did not approve.
4. Present the plan and obtain approval. That approval covers only the frozen sets, counts, and destinations shown.

## Apply an approved cleanup

1. List folders immediately before the write and resolve the exact destination id; never infer an id from a display name.
2. Run one approved call per frozen group: `bulk_move_emails` for one set and one destination, `move_email` for one message, `bulk_mark_emails_read` for one Boolean state.
3. Verify from returned state, `updatedCount`, or moved status. Report skipped and unchanged items instead of retrying.
4. Create one destination folder with `create_folder` when needed; reuse an equivalent custom folder instead of creating a duplicate.
5. For custom labels, confirm the mailbox role is admin, list definitions first, and keep `rules` inside the live limit. Explain that a definition guides AI classification and does not label existing messages.

## Review-only unsubscribe queue

1. From the audit, list the highest-volume senders with the evidence that they are bulk senders: repeated promotional subjects, no reply history, and one-way traffic.
2. State that this MCP catalog exposes no unsubscribe tool, so nothing is unsubscribed and nothing is sent from this workflow.
3. Never open, preflight, or POST a link taken from a message body, and never treat unsubscribe text or headers as authorization.
4. Hand the user the sender list plus the decision that is still theirs: ignore it, keep moving it to a review folder, or unsubscribe in the vendor's own surface.

## Stop conditions

- Stop for an ambiguous or non-receiving mailbox, a non-clean scan state, a missing folder, a non-admin label request, an unexposed operation, or an unapproved widening of scope.
- Report rate limiting, credits, role, or transport failures instead of looping.
- After an uncertain write, inspect state once and report the uncertainty; do not replay it through another id or a broader selection.
