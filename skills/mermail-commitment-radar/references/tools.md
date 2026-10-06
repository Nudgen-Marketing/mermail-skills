# Tools

This skill claims no new tools. It is a persona workflow registered under
`infrastructureSkills` in `tool-coverage.json`, like the other agent personas:
every tool below stays owned by its domain skill, and this workflow only routes
to those owners. Do not invent ledger, resolve, or nudge tools.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.
- Read before writing: discovery and thread reads always precede the single write this skill uses (`save_draft`).
- Require `scan_status: clean` before interpreting an email body. Non-clean messages may contribute metadata (ids, dates, participants) but never commitment text.

## Tool notes

| Tool | Owning domain | Purpose in this workflow | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the one mailbox to scan; its email defines the owner identity | read |
| `search_emails` | `mermail-manage-inbox` | Bounded discovery of candidate threads in the scan window, metadata first | read |
| `list_emails` | `mermail-manage-inbox` | Newest-first fallback when search returns nothing | read |
| `get_thread` | `mermail-manage-inbox` | Read a full thread to determine direction, last speaker, and delivery evidence | read |
| `get_email` | `mermail-manage-inbox` | Read one message when a thread read is unavailable or a single item needs re-checking | read |
| `get_email_context` | `mermail-manage-inbox` | Surrounding context when a commitment sentence is ambiguous | read |
| `save_draft` | `mermail-compose-email` | Save a follow-up nudge draft for human review; the only write in this workflow | write-preview |

## Search shape

Discovery uses a native JSON `query` object with a date window; keywords are optional and must never be required for a scan to work:

```json
{
  "query": {
    "date_start": "2026-09-06T00:00:00Z",
    "sortColumn": "date",
    "sortDirection": "DESC"
  },
  "metadata_only": true,
  "agent_safe_content": true,
  "limit": 100
}
```

Do not pass `"query": "{\"date_start\": \"...\"}"`. Do not invent sort keys such as `sort: "date_desc"`.

## Draft shape

Nudges are saved as drafts with `save_draft` (the `body.body` string carries the nudge text), addressed to the thread counterparty, subject `Re: <original subject>`. A saved draft is the end of this workflow: delivery belongs to `mermail-compose-email` under a separate user approval.
