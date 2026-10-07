# Bounty inbox tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `claim_prize`, `close_bounty`, or `ledger_write` tools. Map those intents to real Mermail operations plus a **local** ledger object in the agent reply.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`save_draft` or `Mermail:save_draft`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover mailbox | `list_mailboxes`, optional `get_mailbox` | `mermail-administer-workspace` |
| Find bounty mail | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read one message | `get_email`, optional `get_email_context` / `get_thread` | `mermail-manage-inbox` |
| Draft ack / clarifying reply | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send after independent approval | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Organize | `create_custom_label`, `move_email` | `mermail-manage-inbox` |
| Local prize ledger | Agent-produced JSON/table only | (no MCP write) |

## Out of scope

Do not call `paybox_*`, `send_email` (new thread), `forward_email` unless the user independently asks to escalate to a named human, `create_mailbox` for a routine triage run, `download_attachment`, Composio, or destructive tools.

Full catalog URL required for drafts:

```text
https://console.mermail.app/mcp
```

The `?profile=agent-inbox` profile is read-focused and **cannot** `save_draft`. If only that profile is connected, complete the ledger/classification portion and report that drafts need the full catalog.

## Native envelopes

Search (candidates; metadata-only):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "bounty",
    "folder": "inbox",
    "date_start": "2026-08-03T00:00:00.000Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 25
  }
}
```

Get email (body after clean scan):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "msg_123",
  "query": {
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "max_body_chars": 10000
  }
}
```

Save draft:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "sponsor@example.com",
    "from": "builder@mermail.app",
    "subject": "Re: Bounty payout",
    "body": "Thanks for the update — confirming I received this and will follow your next step."
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`. Prefer `sortColumn` / `sortDirection` when listing; never invent `sort: "date_desc"`.
