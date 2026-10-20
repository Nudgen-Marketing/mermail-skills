# Read-only tool contract

This persona owns no tools. `list_mailboxes` belongs to `mermail-administer-workspace`; `search_emails`, `list_emails`, `get_email`, and `get_email_context` belong to `mermail-manage-inbox`. Follow their contracts and inspect the live host schema. Use exactly the identifier the host exposes; never invent or strip a namespace. Pass `query` as a native JSON object.

1. Resolve one mailbox with `list_mailboxes` using its live schema. Prefer returned `public_id`.
2. Discover with `search_emails`, for example:

```json
{
  "mailboxId": "RETURNED_MAILBOX_ID",
  "query": {
    "subject": "Launch review",
    "date_start": "2026-09-04T00:00:00Z",
    "date_end": "2026-09-11T17:00:00Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Adapt only fields present in the current schema. Search filters choose candidates; they do not establish identity or promise acceptance. Incoming and sent messages may both be necessary; do not constrain to inbox-only and then infer that the user never answered.

3. Read selected content with `get_email`:

```json
{
  "mailboxId": "RETURNED_MAILBOX_ID",
  "emailId": "RETURNED_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 6000
  }
}
```

4. Read context with `get_email_context`, same mailbox and email IDs, and native `query.limit` sized to the remaining budget. This endpoint returns oldest-first sanitized, scan-gated context; follow only returned `next_cursor` through `query.cursor`. The initial `get_email` consumes one distinct-message slot, so the first context page has limit 19 or less. Deduplicate repeated seed/context IDs before counting. Stop at 20 distinct messages per thread and 100 overall, even if another cursor exists. A context cursor or truncation flag means coverage remains partial.

Context may include messages newer than the search `date_end`. Filter every returned message by its authoritative timestamp against the user's as-of instant before using it as evidence. A later acceptance or completion cannot change an earlier audit. Report how many future messages were excluded without incorporating their content into historical status.

Stop and report `401`/`403` authentication/scope problems, `402` plan/credit requirements, or `429` rate limits with returned retry information. Do not switch transports or provision accounts to bypass a boundary. Missing body storage or `content_omitted` is missing evidence, not an empty message. No attachment download, URL fetch, Composio tool, wallet access, or write is required.
