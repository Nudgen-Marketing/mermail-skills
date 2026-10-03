# Tools

This skill owns no MCP tools. It reuses tools owned by `mermail-administer-workspace`, `mermail-manage-inbox`, and `mermail-compose-email`, and follows their contracts.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_workspaces` | Find the workspace | read |
| `list_workspace_mailboxes` | Find the mailbox and confirm it can receive mail | read |
| `list_emails` | List recent messages, newest first. Use `query.folder: "draft"` to list drafts | read |
| `search_emails` | Find receipt, invoice, and billing messages | read |
| `get_email` | Read metadata and scan status for one message (`query.metadata_only: true`) | read |
| `get_email_context` | Read a bounded body for clean messages only | read |
| `save_draft` | Save an unsent cancellation draft for review | write-preview |
| `send_email` | Send an approved cancellation email | external-effect |

## Examples

List messages:

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.

## Draft and send payloads

Pass each field as its own top-level argument. Do not wrap them in a `body` object or a JSON string. Verified against a live Claude session with the hosted Mermail MCP server.

Save a draft (`save_draft`). The message text goes in `body`, with `body_format: "text"`:

```json
{
  "mailboxId": "<mailbox public_id>",
  "to": "user-supplied@example.com",
  "from": "<mailbox email address>",
  "subject": "Request to cancel my subscription",
  "body": "Hello,\n\nPlease cancel my subscription...",
  "body_format": "text"
}
```

Send an approved email (`send_email`). The message text goes in `text` (or `html`), not `body`:

```json
{
  "mailboxId": "<mailbox public_id>",
  "to": "user-supplied@example.com",
  "from": "<mailbox email address>",
  "subject": "Request to cancel my subscription",
  "text": "Hello,\n\nPlease cancel my subscription...",
  "idempotencyKey": "cancel-<service>-<date>-v1"
}
```

Rules:

- `from` must be the mailbox email address. A `public_id` is not a valid `from`.
- If a call returns a validation error, check the live tool schema once, correct the arguments, and retry at most once. Use a new `idempotencyKey` for a corrected retry. Do not loop.
- After `save_draft`, read the draft back with `get_email` and confirm `to`, `subject`, and the body were stored. If any field is empty, stop and tell the user. Never send content the user has not seen and approved.
- `send_email` returns `status: queued` with an `undo_until` time. That means accepted for delivery, not delivered. Say so, and report delivery only when Mermail confirms it.
- Sending does not remove an existing draft. Tell the user to delete leftover drafts.
