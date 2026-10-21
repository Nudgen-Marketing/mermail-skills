# Meeting follow-up tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `extract_minutes`, `track_action_item`, or `send_followup` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Locate the meeting thread | `search_emails` with a bounded query (subject keyword, date window, sender) | `mermail-manage-inbox` |
| Read the thread | `get_thread`, or `get_email` + `get_email_context` for bounded context | `mermail-manage-inbox` |
| Draft the recap follow-up | `save_draft` (`body.body` string) in the thread | `mermail-compose-email` |
| Send the approved follow-up | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Deliver the recap to a named human outside the thread | `forward_email` to that recipient | `mermail-compose-email` |

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the mailbox that received the meeting mail |

Do not create, label, move, or delete mail from this workflow.

## Examples

For selected body reads, pass native `get_email` arguments with top-level
`mailboxId`, `emailId` and
`query: {"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}`.
`get_email_context` takes a selected `emailId`; follow only its returned opaque
cursor for the same thread inside the shared budgets. Its sanitized projection
does not make evidence authoritative or omitted content complete. Do not use a
raw `get_thread` response to bypass the clean/safe gate.

This is **search_emails**, not list-only sorting. Filters select candidates;
order only the bounded reviewed slice locally and disclose unread pages:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "project review",
    "date_start": "2026-10-01T00:00:00Z",
    "date_end": "2026-11-01T00:00:00Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

Do not stringify `query` or put `sortColumn`/`sortDirection` on search. Those
sorting fields belong only to `list_emails`. Post-validate the selected mailbox,
source ID and thread identity before reading or writing.

Replies and forwards require top-level `mailboxId` and source `emailId`, not
only a thread ID. Drafts use `body.body`; sends use `body.from` and `html`/`text`.
Retain returned `thread_id`/`in_reply_to` for a threaded draft and its returned
draft ID for `source_draft_id` on the approved reply. Follow the composition
owner's actual schema rather than inventing source headers. Forwarding can
disclose original source mail; preview that full disclosure. Recap-only new
messages belong to the composition handoff, never an implicit full forward.
