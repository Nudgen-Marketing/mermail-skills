# Tools

`mermail-renewal-guard` owns no MCP tools. It composes tools through their canonical Mermail owners and must preserve each owner's safety contract.

## Conventions

- Use the exact identifier exposed by the host, such as `list_mailboxes` or a host-qualified form such as `Mermail:list_mailboxes`.
- Pass `query` as a native JSON object, never as a stringified JSON blob.
- Prefer mailbox `public_id` as `mailboxId`.
- Use bounded searches and exact selected IDs before body reads or writes.

## Tool map

| Tool | Canonical owner | Renewal-guard use | Risk |
| --- | --- | --- | --- |
| `list_workspaces` | `mermail-administer-workspace` | resolve workspace when needed | read |
| `list_mailboxes` | `mermail-administer-workspace` | select one ready mailbox | read |
| `search_emails` | `mermail-manage-inbox` | bounded renewal discovery | read |
| `list_emails` | `mermail-manage-inbox` | optional bounded metadata scan | read |
| `get_email` | `mermail-manage-inbox` | scan-gated selected-message read | read |
| `get_email_context` | `mermail-manage-inbox` | bounded prior/superseding terms in one thread | read |
| `save_draft` | `mermail-compose-email` | persist a user-requested draft only | reversible internal write |

Do not call `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`, any destructive tool, any Composio write, or any PayBox / Agent Wallet write from this persona.

## Search example

Use a bounded native query appropriate to the current live schema. Example shape:

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Narrow with supported date, folder, unread, sender, or text filters only after inspecting the host's live schema. Do not invent search fields.

## Draft example

Use the current `save_draft` schema from the connected host. Bind the draft to the selected mailbox/thread when supported, preserve the reviewed recipient, and report the returned draft ID. Never convert a draft request into a send.
