# Tools

This skill owns no MCP tools. It reuses tools owned by `mermail-manage-inbox` and `mermail-compose-email` under their exact contracts. Keep ownership unique in `tool-coverage.json`: do not add these tools anywhere else.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_mailboxes` or a host-qualified form like `Mermail:list_mailboxes`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Reused tools

| Tool | Owner | Purpose | Risk |
| --- | --- | --- | --- |
| `list_workspaces` | mermail-manage-inbox | Resolve workspace before mailbox discovery | read |
| `list_mailboxes` | mermail-manage-inbox | Resolve the hunter mailbox | read |
| `search_emails` | mermail-manage-inbox | Find one preferences thread | read |
| `get_email` | mermail-manage-inbox | Read criteria from a single unambiguous thread | read |
| `save_draft` | mermail-compose-email | Store the digest draft (reversible) | write-preview |
| `send_email` | mermail-compose-email | Send the approved digest | external-effect |
| `reply_to_email` | mermail-compose-email | Send the digest as a thread reply | external-effect |
| `schedule_email_send` | mermail-compose-email | Schedule the approved digest (ISO-8601 UTC) | external-effect |

## Public board reads (not MCP tools)

Bounty boards are fetched with plain HTTPS GET from the agent runtime. They are data sources, not tools, and need no credentials:

```json
{
  "url": "https://earn.superteam.fun/api/listings",
  "headers": { "Accept": "application/json" }
}
```

## Examples

Mailbox discovery with a native JSON query:

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.

There is no `sort: "date_desc"` shortcut. Use the exact tool identifier exposed by the current host.
