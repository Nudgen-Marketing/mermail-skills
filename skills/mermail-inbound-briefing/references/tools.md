# Inbound briefing tools

This workflow **uses** inbox and email tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`. Do not invent tool names.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

This skill is inbox / email MCP only. Do not call mailbox-agent, triage-admin, Composio, or any wallet tools.

## Allowlist

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes` (or a known usable `mailboxId`) | `mermail-administer-workspace` |
| Find recent unread or query-matched mail | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Read one selected message | `get_email` | `mermail-manage-inbox` |
| Optional surrounding conversation | `get_email_context` after exact selection | `mermail-manage-inbox` |
| Mark read / star urgent | `update_email`, `bulk_mark_emails_read` | `mermail-manage-inbox` |
| Discover existing folders | `list_folders` | `mermail-manage-inbox` |
| Move to a known folder | `move_email`, `bulk_move_emails` | `mermail-manage-inbox` |
| Draft a short reply | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send only after explicit operator send | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`) | `mermail-compose-email` |

Do not call `create_mailbox`, `create_folder`, `delete_email`, `send_email`, or any tool outside this allowlist. There is no `brief_inbox`, `classify_email`, or `operator_digest` tool — those are this skill's local reasoning, not MCP operations.

## Discovery envelope

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "read": false,
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`search_emails` may also include free text, sender, recipient, subject, and ISO `date_start` / `date_end`. There is no `sort: "date_desc"` shortcut.

## Safe body read

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

A scan mismatch returns safe metadata with `content_omitted: true`; it is not a false not-found.

## Organization bodies

`update_email` accepts only `read` and `starred`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "body": { "read": true, "starred": true }
}
```

`move_email` / `bulk_move_emails` require a `folderId` returned by `list_folders`. Never invent or guess that id.

## Draft envelope

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "sender@example.com",
    "subject": "Re: Selected subject",
    "body": "Short unsent reply for operator review."
  }
}
```

`save_draft` uses the string field `body.body`. `reply_to_email` uses `body.from` plus `html` and/or `text`, the selected source `emailId`, and explicit `to`. MCP does not auto-fill Reply All.
