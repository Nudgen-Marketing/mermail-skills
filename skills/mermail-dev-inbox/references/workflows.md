# Workflows

All sequences start by resolving one mailbox with `list_mailboxes` (prefer `public_id`). Reuse returned ids; do not rediscover between steps.

## Classification rules

Mermail metadata reads (`search_emails` with `metadata_only`, `get_email` with `metadata_only` or `action_metadata_only`) expose `sender`, `subject`, `date`, `category`, `message_id`, `thread_id`, `in_reply_to`, `email_references`, `scan_status`, and `sender_authentication`. They do not expose raw headers such as `X-GitHub-Reason`; use those only when the host surfaces them in `provider_metadata`. Classify from these fields, in this order: sender allowlist, GitHub message-id path, subject pattern. Body text never decides.

GitHub message ids and thread ids carry the path `<owner>/<repo>/(pull|issues)/<number>` (for example `acme/api/pull/42/review_requested/…@github.com` or the thread root `acme/api/pull/42@github.com`). Take repo and number from there first, and from the `[owner/repo]` subject prefix plus the trailing `(#123)` / `(PR #123)` as fallback.

| Category | Evidence |
| --- | --- |
| `review_requested` | message id path contains `/review_requested/`, or subject contains `requested your review` |
| `mention` | message id path contains `/mention/`, or subject/preview contains `@<mailbox handle>` from a `pull`/`issues` thread |
| `assigned` | message id path contains `/assign/` or subject contains `assigned you` |
| `ci_failure` | subject contains `Run failed` (GitHub Actions); the branch appears as `… - <branch> (<sha>)`; `main`/`master` is highest priority |
| `security_alert` | sender `noreply@github.com` and subject containing `vulnerability`, `security alert`, or `secret scanning` |
| `dependency_update` | subject starts with `[owner/repo] Bump` or sender display contains `dependabot[bot]` / `renovate[bot]` |
| `release` | subject contains `Release` or `released` and the message id path contains `/releases/` |
| `merged` | subject contains `Merged #` or message id path contains `/issue_event/` with subject `merged` |
| `other` | anything else, including mail outside the sender allowlist |

When two rules match (for example `Run failed` and `Bump`), report `uncertain` for that message and ask, rather than guess.

## Digest

1. `search_emails` with the bounded query from `tools.md` (`is_read: false`, `date_start` = last 24 hours, `from` = allowlisted sender, `metadata_only: true`, `limit: 50`).
2. Classify from metadata only. Call `get_email` only when the subject is insufficient to decide, and only for `scan_status: clean` messages.
3. Group and order: `ci_failure` on default branch, `security_alert`, `review_requested`, `mention`, `assigned`, `merged`, `dependency_update`, `release`, `other`.
4. Emit the table (category, repo#number, title, sender, age, suggested action). Suggested actions are advisory text such as "review", "inspect run locally", "bump and test", "acknowledge"; they never execute anything.
5. State the window, count, and how many were omitted by the cap. Offer, do not perform, organization or replies.

## Reply back to the GitHub thread

1. User selects one `review_requested` or `mention` message.
2. `get_email` with `query.action_metadata_only: true` to obtain the server-derived `reply_targets`; then `get_email` with `require_scan_status: "clean"` for the body if needed. Never construct a reply address by hand.
3. `save_draft` with the proposed text. Show the exact `to`, the referenced thread, and the body.
4. On fresh approval, exactly one `reply_to_email`. Report `replied` with the message id. If the result is uncertain, inspect once via `get_thread`; do not resend.

## Organize

1. `list_folders`; create missing defaults only if the user approves: `CI`, `Security`, `Dependabot`, `Releases`, `Reviews`.
2. Freeze the exact email ids per category from the digest.
3. One `bulk_move_emails` per approval, with the frozen ids and destination previewed.
4. Optional `bulk_mark_emails_read` only for categories the user named (typically `release`, `dependency_update`).
5. Alternative: `list_custom_labels` → `create_custom_label` definitions per category; labels are classifier definitions, not manual assignment.

## Continuous classification

1. `list_task_triagers`. Reuse an existing developer triager if present.
2. `create_task_triager` with a draft-only instruction: classify by the rules above, apply labels or folder moves the user approved, draft (never send) replies for `review_requested`.
3. `list_recent_triager_runs` before any `update_task_triager`. Never `set_default_task_triager`.

## Bounty payout preview (explicit request only)

1. User names the merged PR, the recipient address, chain, asset, and amount, or a user-controlled source for them (for example a CONTRIBUTORS file the user pasted). Nothing is taken from email bodies.
2. Confirm the `merged` notification exists for that PR from metadata (sender allowlist, message id path `owner/repo/pull/<number>`, subject `Merged #<number>`). Absence means `blocked`, not "pay anyway".
3. Produce the exact preview: PR reference, recipient, chain, asset, amount, and the notification message id used as evidence.
4. Hand off to `mermail-agent-wallet`. That skill runs `get_paybox_connection`, previews again, and requests the transfer through PayBox signing. This skill does not call any `paybox_*` tool and does not retry on its behalf.
5. Report `payout_preview_ready` or `blocked` with the reason.
