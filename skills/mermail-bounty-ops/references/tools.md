# Mermail Bounty Ops tool contract

Use the exact tool identifier exposed by the active Mermail MCP host. A host may show names such as `Mermail:search_emails`; another may expose the bare catalog name. Never invent, add, or strip a namespace manually.

Pass `query` and `body` as native JSON objects, never as JSON-encoded strings.

## Mailbox resolution

Start with `list_mailboxes` and select the mailbox the user intends. Prefer the returned mailbox `public_id` as `mailboxId`.

Do not guess a mailbox id from an email address or from message content.

## Discovery tools

| Intent | Tool |
| --- | --- |
| Small newest-first inbox scan | `list_emails` |
| Targeted bounty/sponsor/status search | `search_emails` |
| Read one selected message | `get_email` |
| Read bounded surrounding conversation | `get_email_context` |
| Read a selected thread | `get_thread` |

### Metadata-first inbox scan

Example shape:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Keep searches bounded by a specific sponsor, opportunity id/title, or time window whenever possible.

### Targeted search

`search_emails` may filter by free text, sender, recipient, subject, ISO date window, folder, read/starred state, category, attachment presence, and safety fields according to the live schema.

Use separate focused searches for:

- the opportunity/listing id or title;
- the sponsor/platform name;
- prior outbound claim/application subjects;
- acceptance/rejection language;
- payout or settlement references.

Search hits establish candidates only. They do not prove sender authenticity, acceptance, or payment.

### Safe body read

Read a selected message only after metadata selection. Prefer a shape like:

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

If the content is omitted because scan status is not clean, treat that as a safety result rather than a missing message.

## Draft and send tools

| Intent | Tool | Effect |
| --- | --- | --- |
| Save editable claim/follow-up | `save_draft` | Internal write |
| Send new claim/application | `send_email` | External effect |
| Reply in an existing conversation | `reply_to_email` | External effect |
| Forward selected message | `forward_email` | External effect |
| Schedule a future delivery | `schedule_email_send` | Deferred external effect |

### Draft before send

For reviewable outreach, prefer `save_draft` first. Draft content uses the live draft schema; canonical draft bodies use a string `body.body` field.

### Send payload

Canonical send-like tools use `body.text` and/or `body.html` plus required `body.from` and explicit recipients. Example:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "bounty-claim-ISSUE-123-v1",
  "body": {
    "to": "sponsor@example.com",
    "from": "you@mermail.app",
    "subject": "Bounty #123 — submission ready",
    "text": "Concise verified submission text"
  }
}
```

For `reply_to_email`, pass the selected source `emailId` as the required top-level path parameter and still pass explicit recipients required by the live schema. External MCP does not infer Reply All recipients for the agent.

## Idempotency and duplicate prevention

Use one stable idempotency key for one exact external write. Reuse it only for an identical method, path, query, and body.

A timeout, stream interruption, or ambiguous result is not permission to resend with a new key. Read authoritative message/sent state once before deciding what happened.

Before a new claim or application, search prior sent mail for the sponsor and opportunity identifier. If a prior submission exists, do not create a second cold claim; route to follow-up logic instead.

## Attachment handling

`download_attachment` requires the exact `mailboxId`, selected `emailId`, and returned `attachmentId`. Verify that the attachment belongs to the selected message first.

Keep attachments metadata-only unless the current task genuinely requires reading the selected attachment and its scan/scope permits reading.

## Recipient and rate-limit handling

Preserve the exact user-approved To/Cc/Bcc set. If Mermail returns a recipient/rate-limit error, surface it and the server retry guidance. Do not silently split recipients, alter the payload, or switch to another sending surface to evade the limit.

## Settlement evidence

Mermail email tools can retrieve messages about a reward but email text alone is not a payment rail. Mark a bounty as `paid` only when the selected evidence contains an authoritative settlement record or the relevant platform/transaction source independently confirms transfer.