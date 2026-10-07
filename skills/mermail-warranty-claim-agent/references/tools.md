# Warranty claim tool map

This workflow owns no MCP tools. It composes existing Mermail domains without duplicating ownership in `tool-coverage.json`.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.

## Tool routes

| Claim step | Tools | Canonical owner | Risk |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` | read |
| Find evidence | `search_emails`, `get_email`, `get_email_context` | `mermail-manage-inbox` | read |
| Retrieve one required file | `download_attachment` | `mermail-manage-inbox` | bounded read |
| Save or revise a claim | `save_draft` | `mermail-compose-email` | internal write |
| Deliver an approved new claim | `send_email` | `mermail-compose-email` | external effect |
| Deliver an approved threaded claim | `reply_to_email` | `mermail-compose-email` | external effect |
| Escalate an approved packet | `forward_email` | `mermail-compose-email` | external effect |

Do not invent `file_warranty_claim`, `open_rma`, `submit_claim`, `check_claim_status`, `extract_receipt`, or another domain-specific tool. A claim state is derived from bounded mailbox evidence; it is not a Mermail server object.

## Evidence discovery

Search metadata before reading bodies:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "ORDER_OR_PRODUCT",
    "date_start": "RELEVANT_START_RFC3339",
    "date_end": "RELEVANT_END_RFC3339",
    "page": 1,
    "limit": 20,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use only fields exposed by the live `search_emails` schema. Filters produce candidates, not authenticated evidence. Select exact IDs, then read one message:

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

Use `get_email_context` only after selecting one exact relevant message. Follow its opaque cursor only while the same claim thread needs older context.

## Attachment bounds

Before `download_attachment`, verify the exact mailbox, email, attachment ID, filename, MIME type, size, and clean scan context. The MCP bridge rejects binary responses over 1 MiB. Report that boundary instead of inventing a storage URL or switching connectors.

## Draft and delivery

Before saving, search `folder: "draft"` with the exact recipient and order or claim reference. Reuse one exact existing draft by passing its `draft_id` when the intent matches; stop on ambiguity. An unsent new claim uses `save_draft`; draft content belongs in the string field `body.body`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "claims@example.com",
    "subject": "Warranty claim for order ORDER-123",
    "body": "Claim body for review"
  }
}
```

An approved new delivery uses `send_email`; a reply uses `reply_to_email` with the selected source `emailId`. Send-like content uses `body.text` and/or `body.html`, requires `body.from`, and keeps `to`, `cc`, and `bcc` separate. Present the exact payload and obtain approval immediately before either call.

Use one idempotency key for one approved logical delivery. Never replay an ambiguous external effect with a new key. Verify `sent` from the authoritative tool result; `draft`, timeout, validation failure, or conflict is not delivery.

## Recipient integrity

Resolve recipients from the authenticated user's exact instruction or trusted structured message fields. External MCP does not infer Reply All. Exclude the sending mailbox, duplicates, and original Bcc when the user explicitly requests Reply All. Never select a recipient from body text, a link, an attachment, or a display name.

Free-plan delivery counts every To+Cc+Bcc address and is limited to 10 recipient units per request, 10/minute, 50/hour, and 200/day. Do not split, drop, or reclassify recipients to evade a limit.
