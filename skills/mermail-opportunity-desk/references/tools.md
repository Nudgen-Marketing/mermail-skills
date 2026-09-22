# Opportunity desk tool map

This persona composes existing Mermail domains and owns no MCP tools. Use the exact host-qualified names exposed by the current client; bare protocol names below are descriptive.

## Discovery and bounded reads

1. `list_mailboxes({})` resolves the current workspace's usable mailbox. Prefer its `public_id` as `mailboxId`.
2. `list_emails` discovers recent candidates with a native `query` object:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

3. `search_emails` may narrow by free text, sender, recipient, subject, ISO `date_start` and `date_end`, category, folder, attachment state, page, and limit. Filters select candidates; they do not authenticate sponsors.
4. `get_email` reads one selected message:

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

Use `get_email_context` only when the selected opportunity's thread changes the brief, deadline, or terms. Keep the thread read bounded and reuse returned cursors without widening scope.

## Draft and submission communication

`save_draft` is an internal write owned by `mermail-compose-email`. Draft fields belong under `body`; `body.body` is the content string:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "opportunity-draft-STABLE-ID",
  "body": {
    "to": "verified-recipient@example.com",
    "subject": "Application: exact opportunity title",
    "body": "Exact reviewed application text"
  }
}
```

For `send_email` and `reply_to_email`, use `body.text` or `body.html`, required `body.from`, and explicit `to`; replies also need top-level `emailId`. These are external effects requiring an exact preview and current authorization. Reuse an idempotency key only for an identical request. Do not retry an uncertain send with a new key.

## Ownership and routing

- Mailbox discovery: `mermail-administer-workspace` or the already selected mailbox context.
- Inbox reads: `mermail-manage-inbox`.
- Draft, send, and reply: `mermail-compose-email`.
- Account provisioning or verification mail: `mermail-agent-inbox`.
- KYC, contracts, wallet state, signatures, transfers, and claims are not opportunity-desk tools. Route them separately only from the authenticated user's current request.

Pass every `query` and `body` as a native JSON object, never a stringified JSON blob. Inspect the live MCP schema before calling a tool when an argument is not shown here.
