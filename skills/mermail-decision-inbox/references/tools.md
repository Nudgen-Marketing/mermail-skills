# Tools Reference — mermail-decision-inbox

Pass all `query` values as native JSON objects. Never stringify an object into a string field.
Use `public_id` as `mailboxId` wherever available.

## Read tools (permitted, no approval required)

| Tool | Purpose | Key parameters |
|---|---|---|
| `list_workspaces` | Discover workspace ID when unknown | — |
| `list_mailboxes` | Discover `public_id`, confirm `can_receive: true` and `receiving_status: ready` | — |
| `list_emails` | Baseline snapshot; locate candidate emails by folder/date | `mailboxId`, `folder`, `metadata_only: true`, `limit`, `sortColumn: "date"`, `sortDirection: "DESC"` |
| `search_emails` | Narrow search by sender, subject, or time window | `mailboxId`, `from`, `subject`, `date_start`, `metadata_only: true` |
| `get_email` | Read one message body after unambiguous candidate selection | `mailboxId`, `emailId`, `require_scan_status: "clean"` |
| `get_email_context` | Read selected message + bounded oldest-first thread page | `mailboxId`, `emailId`, `limit` (1–50) |
| `get_thread` | Read all messages in a thread by thread ID | `mailboxId`, `threadId` |

## Write tools (permitted, human review of output required)

| Tool | Purpose | Constraints |
|---|---|---|
| `save_draft` | Save a clarification email as an unsent draft | `NEEDS_INFORMATION` classification only. Never call `send_email`. |

## Prohibited tools for this skill

- `send_email` — never called; drafts only
- `reply_to_email` — never called
- `forward_email` — never called
- `schedule_email_send` — never called
- `delete_email`, `bulk_delete_emails`, `empty_trash` — never called
- `prepare_destructive_action` — never called
- Any Agent Wallet or PayBox tool

## Argument examples

```json
// list_emails — correct
{
  "mailboxId": "7df86f21-46c7-4d01-ab81-9c57cc799eb7",
  "query": {
    "folder": "inbox",
    "limit": 20,
    "metadata_only": true,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}

// save_draft — correct
{
  "mailboxId": "7df86f21-46c7-4d01-ab81-9c57cc799eb7",
  "body": {
    "to": "vendor@example.com",
    "from": "decision-inbox@mermail.app",
    "subject": "Re: Vendor Plan Selection",
    "body": "Thank you for the proposal. Before we can select a plan, could you please confirm the cancellation terms for both Plan A and Plan B?",
    "body_format": "text"
  }
}
```
