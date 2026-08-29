# Workflows

All sequences start by resolving one mailbox with `list_mailboxes` (prefer `public_id`). Reuse returned ids; do not rediscover between steps.

## Classification rules

Use headers first, subject pattern second, body never.

| Category | Evidence |
| --- | --- |
| `review_requested` | `X-GitHub-Reason: review_requested`, or subject contains `requested your review` |
| `mention` | `X-GitHub-Reason: mention` or `team_mention` |
| `assigned` | `X-GitHub-Reason: assign` |
| `ci_failure` | `X-GitHub-Reason: ci_activity` and subject contains `Run failed`; note the branch in the subject (`… - main (sha)` is highest priority) |
| `security_alert` | `X-GitHub-Reason: security_alert`, or `noreply@github.com` subject containing `vulnerability` or `secret scanning` |
| `dependency_update` | `X-GitHub-Sender: dependabot[bot]` or `renovate[bot]`, or subject starts with `Bump` |
| `release` | subject contains `Release` and `X-GitHub-Reason: subscribed` from a release event |
| `merged` | subject contains `Merged #` or body-less notification with `X-GitHub-Reason: author`/`subscribed` and state merged in metadata |
| `other` | anything else, including mail outside the sender allowlist |

`List-Id` (for example `acme/api <api.acme.github.com>`) gives the repo. The `[owner/repo]` subject prefix and the trailing `(#123)` / `(PR #123)` give the reference.

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
2. Confirm the `merged` notification exists for that PR from metadata (`List-Id`, reference, `X-GitHub-Reason`). Absence means `blocked`, not "pay anyway".
3. Produce the exact preview: PR reference, recipient, chain, asset, amount, and the notification message id used as evidence.
4. Hand off to `mermail-agent-wallet`. That skill runs `get_paybox_connection`, previews again, and requests the transfer through PayBox signing. This skill does not call any `paybox_*` tool and does not retry on its behalf.
5. Report `payout_preview_ready` or `blocked` with the reason.
