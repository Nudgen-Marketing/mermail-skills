# Open Loops tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `track_commitment`, `list_loops`, `open_loops`, or `nudge` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve the review mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Scan candidates | `list_emails`, `search_emails` (metadata-only first) | `mermail-manage-inbox` |
| Read a selected message | `get_email` (`require_scan_status: clean`) | `mermail-manage-inbox` |
| Check completion state | `get_thread`, `get_email_context` | `mermail-manage-inbox` |
| File a loop | `list_folders`, `create_folder`, `move_email` | `mermail-manage-inbox` |
| Future auto-classification | `create_custom_label` (admin-only definition) | `mermail-manage-inbox` |
| Draft a nudge | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send an approved nudge | `reply_to_email` or `send_email` (`body.from` + `html`/`text`) | `mermail-compose-email` |
| Standing loop-watch | hand off to `mermail-automate-triage`; no triager writes here | `mermail-automate-triage` |

## Scan patterns

Newest-first metadata scan, inbox folder:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 50,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Repeat with the sent folder so owner commitments are visible. Use `search_emails` date filters (`date_start` / `date_end`) to bound the window instead of paging unbounded history.

Read one selected message:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

## Filing bodies

`list_folders` before any folder write. `create_folder` uses `body.name` (`"Open Loops"`); the id is derived by slugifying the name. `move_email` uses `body.folderId` with the exact mailbox and email path ids. `update_email` changes only read/starred state — there is no per-message label-assignment field; `create_custom_label` manages AI classifier definitions (`name`, `rules`, optional `color`) and is admin-only.

## Nudge draft body

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "counterpart@example.com",
    "subject": "Following up: invoice for June",
    "body": "Hi Ana — circling back on the invoice I promised for Friday. It is attached to my next note; flagging here so it does not slip."
  }
}
```

Drafts take the string field `body`; do not pass `html`/`text` to `save_draft`. `reply_to_email` / `send_email` require `body.from` plus `html` and/or `text`, with explicit recipients — MCP does not auto-fill Reply All. An approved send is one external write per thread; on `429 email_send_rate_limit_exceeded`, surface `Retry-After` and stop.
