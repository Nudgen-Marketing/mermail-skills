# Open Loops workflows

Each sequence assumes the security contract in [security.md](security.md) and the tool contract in [tools.md](tools.md).

## 1. Follow-through review (read-only)

1. Confirm scope: mailbox, folders (default inbox plus sent), and date window (default last 14 days). Ask once when missing; do not guess a wider window.
2. `list_mailboxes`; select one ready receiving mailbox; keep its `public_id` for every later call.
3. Metadata-only scans of inbox and sent inside the window: `list_emails` (page/limit ≤ 50, `sortColumn: "date"`, `sortDirection: "DESC"`) or `search_emails` with `date_start` / `date_end`.
4. Shortlist candidate threads: direct asks to the owner, owner promises in sent mail, and owner questions with no visible reply.
5. For each shortlisted thread, `get_email` the key messages (`require_scan_status: clean`) and `get_thread` for completion state. A satisfying later reply closes the loop.
6. Emit the open-loops review: direction, counterpart, age, source email id, quoted phrase, suggested next move. Mark scan-gated or ambiguous threads `uncertain` / `needs_clarification`.
7. Stop. Filing and drafting happen only when the user asks for them (or asked for the full workflow up front).

## 2. Filing loops

1. Present the filing plan: target folder `Open Loops` and the exact thread list.
2. `list_folders`; reuse an existing `Open Loops` folder id when present, otherwise `create_folder` with `body.name: "Open Loops"` once.
3. `move_email` each approved thread into the folder. Report each move; never file mail the user did not confirm as a loop.

## 3. Nudge drafts

1. For each loop the user wants chased, compose one nudge: counterpart recipient, subject referencing the original thread, short body naming the commitment and the ask.
2. `save_draft` with the string `body.body`. One draft per loop; never batch several loops into one recipient's draft.
3. Report drafts as `drafted` with recipient and loop. A draft is not delivery.

## 4. Approved send

1. Show the exact preview: recipients, subject, body, and the thread being answered.
2. On fresh approval for that exact preview, call exactly one `reply_to_email` (same thread) or `send_email` (new thread) with `body.from` set to the mailbox email.
3. Report `sent` only on an authoritative send result; otherwise report the pending or failed state verbatim. On rate limits, surface `Retry-After` and stop — no automatic retry.

## 5. Standing loop-watch (handoff only)

When the user asks for automatic daily or weekly loop checks, hand off: `mermail-automate-triage` owns triager creation (draft-only classification triagers), and `mermail-administer-workspace` owns mailbox auto-response modes. This skill does not create, update, or delete triagers, and never calls `set_default_task_triager`.

## 6. Weekly digest (optional)

On request, compile the current review into one digest draft addressed to the mailbox owner via `save_draft`. Sending the digest follows the approved-send sequence above.
