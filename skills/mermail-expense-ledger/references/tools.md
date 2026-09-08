# Tools used by mermail-expense-ledger

All tools are existing Mermail MCP tools; this skill owns none. Read tools before writes; writes are limited to a
custom label and drafts. `mailboxId` is the mailbox `public_id` from `list_mailboxes`.

| Step | Tool | Arguments that matter | Notes |
| --- | --- | --- | --- |
| Resolve | `list_workspaces` | none | Only when the workspace id is unknown. |
| Resolve | `list_mailboxes` | none | Pick one mailbox; use `public_id`. |
| Collect | `search_emails` | `query.query` (one term), `query.date_start`, `query.date_end`, `query.metadata_only=true`, `query.require_scan_status=clean`, `query.limit=50`, `query.page` | One call per search term; merge results on email id. |
| Collect | `list_emails` | `query.custom_label=ledger/processed`, `query.metadata_only=true`, `query.limit=100` | Ids to exclude on re-runs. |
| Read | `get_email` | `emailId`, `query.agent_safe_content=true`, `query.require_scan_status=clean`, `query.max_body_chars=12000` | One message per call; never batch-read the whole inbox. |
| Read | `download_attachment` | `emailId`, `attachmentId` | Only when the body lacks a total and the attachment looks like an invoice or receipt (PDF, image). |
| Label | `list_custom_labels` | none | Check whether `ledger/processed` exists. |
| Label | `create_custom_label` | `body: { name: "ledger/processed" }` | Once, after approval. |
| Label | `update_email` | `emailId`, `body: { custom_labels: [...] }` | Add the label to each processed message, after approval. Read the current labels first and keep them. |
| Draft | `save_draft` | `body: { to, from, subject, body, body_format: "text" }` | One draft per follow-up; `from` is the mailbox email. Never `send_email`. |

Forbidden in this skill: `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`, `delete_email`,
`bulk_*`, `move_email`, `empty_trash`, every `paybox_*` and Agent Wallet tool, `execute_composio_tool`.

## Helper script

`scripts/ledger.py` (Python 3.9+, standard library only):

- `ledger.py extract emails.json ledger.csv` reads a JSON array of `{email_id, mailbox_id, from, subject, date, text}`
  and appends or updates one row per email.
- `ledger.py reconcile ledger.csv transactions.csv reconciliation.md` writes the four lists.
- `ledger.py drafts reconciliation.md drafts.json` produces draft bodies for receipt requests and disputes; the
  agent passes each one to `save_draft` after the user approves the previews.

The transactions CSV needs the columns `date`, `amount`, `currency`, `description` (extra columns are kept as the
reference). Dates are ISO `YYYY-MM-DD`; amounts are decimals, negative for refunds.
