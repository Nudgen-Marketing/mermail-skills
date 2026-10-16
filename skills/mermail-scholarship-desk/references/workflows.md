# Scholarship desk workflows

## 1. Resolve the application mailbox

1. Call `list_mailboxes`. Prefer a mailbox with `can_receive` true and a ready receiving status.
2. Reject disabled, non-receiving, or ambiguous mailboxes. If several fit, ask the user which address they gave to programs.
3. If none exists, stop and offer the provisioning path owned by `mermail-agent-inbox` (reuse-or-create for a service-scoped address). A new hosted mailbox consumes provision credits.

## 2. Build or refresh the Application Board

1. Confirm timezone, explanation language, and signature name (ask once if missing).
2. One bounded metadata-only discovery call (`list_emails` newest 25, or one keyword `search_emails`).
3. Drop obvious non-application mail by subject and sender metadata. Keep uncertain ones as candidates.
4. For each candidate: `get_email` with the safe-read query. Run the fee-scam screen first.
5. Classify stage, extract program name, required actions, quoted deadline, and stated timezone.
6. Derive the local deadline only when a timezone or offset is stated. Otherwise write `timezone not stated`.
7. Render the board from [templates.md](templates.md). List `suspicious_hold` and `unclear` rows in separate sections.
8. If the user asked for explanations, add one short plain-language paragraph per row in their language.

## 3. Draft replies for review

1. Draft only for rows in `docs_requested`, `interview_invited`, `decision_admit`, `decision_waitlist`, or `unclear` rows where a clarifying question helps.
2. Never draft to a `suspicious_hold` sender.
3. Call `save_draft` once per reply with explicit `to` (the selected message's sender), subject `Re: <original subject>`, and `body.body`. Pass `in_reply_to` / `thread_id` when returned.
4. For interview invitations, draft a confirmation only for a slot the user chose. If the user has not chosen, list the offered slots (quoted and derived) and ask.
5. For document requests, draft a cover note that lists only documents the user confirms they have. Do not attach files unless the user selects the exact file.
6. Show each draft: program-language text, back-translation into the user's language, commitments list.

## 4. Recommender reminders

1. Use only recommender names and addresses the user typed in this conversation.
2. Quote the letter deadline from the program email and show the derived local time if a timezone is stated.
3. `save_draft` one reminder per recommender. Do not put several recommenders in one To line unless the user asks.
4. Present drafts for approval. Sending uses `send_email` only after an exact preview and approval, one message at a time.

## 5. Send an approved reply

1. Re-read the selected draft or source message if anything may have changed.
2. Show the exact preview: from, to, cc (if any), subject, body, back-translation.
3. After approval, call `reply_to_email` once with an idempotency key, explicit `to`, `from`, `subject`, and `text`. Pass `source_draft_id` when sending a saved draft.
4. Report `sent` only when the tool result confirms it. If the result is uncertain, inspect the Sent folder once with `list_emails` and do not resend.

## 6. Organize (optional, on request)

1. Star rows whose quoted deadline is within 7 days with `update_email` (`starred: true`).
2. To file processed mail, call `list_folders`; create a folder only if the user asks; preview, then `move_email` once per message.
3. Never delete. Deletion belongs to `mermail-manage-inbox`.

## 7. Recover from failure

- `401`/`403`: route to `mermail-mcp`; do not switch accounts.
- `429`: surface `Retry-After`, stop the run, keep drafts already saved.
- Tool not found: let the host reload tools once; do not rename tools.
- Ambiguous program or deadline: ask the user, show sender and subject only.
