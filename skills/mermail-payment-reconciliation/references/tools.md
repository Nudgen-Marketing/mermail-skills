# Payment reconciliation tool contract

This skill is read-only and reuses tools owned by `mermail-administer-workspace` and `mermail-manage-inbox`. Use the exact host-qualified names exposed by the current MCP catalog; do not invent or manually add a prefix.

Pass `query` and `body` as native JSON objects. Never stringify them. Prefer mailbox `public_id` as `mailboxId`.

## Discovery

Use `list_workspaces` or `list_mailboxes` only as needed to resolve the user’s requested mailbox. Keep discovery bounded and do not select a mailbox solely because it is newest. A disabled or ambiguous mailbox must stop the workflow.

## Candidate search

Use one bounded `search_emails` call with the user’s time range and relevant terms. Candidate search is not sender authentication. Useful search terms can include provider receipt vocabulary such as `receipt`, `paid`, `settled`, `refund`, `refunded`, `pending`, `invoice`, or `transaction`, but only the user’s requested scope determines the final query.

Example shape:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "text": "receipt paid settled refund",
    "date_start": "2026-01-01T00:00:00Z",
    "date_end": "2026-01-31T23:59:59Z",
    "page": 1,
    "limit": 50,
    "agent_safe_content": true,
    "metadata_only": true
  }
}
```

Use the live schema when a field is optional or has changed. Do not scan further pages unless the result explicitly provides a next page and the user’s bounded request justifies it.

## Evidence reads

For each selected message, call `get_email` once with a clean-content gate and a body cap:

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

Use authentication metadata such as `sender_authentication.status === "pass"` as one confidence signal only. A passed authentication check does not prove that the amount was settled. Do not use `download_attachment` for reconciliation unless the user separately authorizes the exact attachment.

## Output rules

Retain the provider message ID as the evidence reference. Preserve the original amount and currency. A missing transaction identifier, status, date, or payer is `unknown`; do not infer it from a subject line or a sender display name. If a message is scan-gated or content is omitted, report that limitation and do not classify it as settled.
