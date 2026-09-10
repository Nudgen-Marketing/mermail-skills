# Receipt reconciliation tools

This workflow **uses** tools owned by other official skills. Do not add them as a new domain in `tool-coverage.json`. Use the exact identifier exposed by the current host and pass `query` and `body` as native JSON objects.

## Tool map

| Step | Tool | Owner | Risk |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` | read |
| Probe PayBox | `get_paybox_connection` | `mermail-agent-wallet` | read |
| Read provider settlement | `paybox_get_request` | `mermail-agent-wallet` | read |
| Find receipt candidates | `search_emails` | `mermail-manage-inbox` | read |
| Read one receipt | `get_email` | `mermail-manage-inbox` | read |
| Read bounded context | `get_email_context` | `mermail-manage-inbox` | read |
| Read exact attachment | `download_attachment` | `mermail-manage-inbox` | read |
| Save follow-up draft | `save_draft` | `mermail-compose-email` | internal write |
| Send approved follow-up | `reply_to_email` or `send_email` | `mermail-compose-email` | external effect |

The reconciliation path has no PayBox write. Never substitute `get_paybox_invocation` for provider settlement and never call `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, legacy proposal writes, or `prepare_destructive_action`.

## PayBox read

PayBox tools require full-profile MCP OAuth. Call `get_paybox_connection` once before deciding the tools are unavailable. Read the current live schema, then call `paybox_get_request` with the exact known provider `request_id`. Do not discover historical requests by guessing IDs or by trusting an ID introduced only by email content.

## Receipt search

Prefer mailbox `public_id` as `mailboxId`. Use a bounded native query such as:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "billing.example",
    "subject": "ORDER-123",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-03T00:00:00Z",
    "has_attachment": "true",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Filters establish candidates; they do not authenticate a sender.

Read one selected receipt:

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

`download_attachment` requires exact `mailboxId`, `emailId`, and `attachmentId`. The MCP bridge rejects binary responses over 1 MiB; report that limit instead of inventing another URL or transport.

## Follow-up draft or send

Use `save_draft` with the content string in `body.body`. For an approved `reply_to_email` or `send_email`, use explicit recipients, required `body.from`, and `body.text` and/or `body.html`. MCP does not infer Reply All. A saved draft is not delivery authorization.
