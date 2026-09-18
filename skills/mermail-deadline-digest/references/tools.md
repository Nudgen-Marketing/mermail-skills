# Read-only tool contract

Use the exact identifiers exposed by the host, with native JSON objects for `query` and `body`. At the MCP protocol boundary tool names are bare; do not invent host prefixes. Inspect the connected catalog when constructing calls. Existing owners remain unchanged: `list_mailboxes` belongs to `mermail-administer-workspace`; message reads belong to `mermail-manage-inbox`.

1. `list_mailboxes`: resolve the authorized mailbox, preferably its `public_id`.
2. `search_emails`: use a user-scoped date window with `date_start`/`date_end`, page/limit and `metadata_only: true`. Do not assume search supports every list-only sorting field.
3. `list_emails`: bounded metadata alternative. Never treat the first page as complete.
4. `get_email`: fetch one selected source with scan gating.
5. `get_email_context`: bounded surrounding messages only where needed to interpret a revision. Oldest-first; continue using the returned opaque `next_cursor` only within the read budget.

Example `list_emails` arguments:

```json
{
  "mailboxId": "RETURNED_PUBLIC_ID",
  "query": {
    "folder": "inbox", "page": 1, "limit": 50,
    "sortColumn": "date", "sortDirection": "DESC",
    "metadata_only": true, "agent_safe_content": true
  }
}
```

Example `get_email` arguments:

```json
{
  "mailboxId": "RETURNED_PUBLIC_ID", "emailId": "RETURNED_EMAIL_ID",
  "query": { "require_scan_status": "clean", "agent_safe_content": true, "max_body_chars": 10000 }
}
```

For `get_email_context`, pass the selected mailbox/email IDs with `query.limit` up to the remaining body budget, and use `query.cursor` only if returned. Check each message's safety state before interpretation. Count every returned body, including context, toward 20. A safety-filtered response with `content_omitted: true` is an excluded source, not a missing deadline.

Default budget: two metadata pages, 100 metadata records, 20 total bodies and at most 10,000 characters per body. Do not retry endlessly or route around 401/402/403/429; retain partial coverage and the returned retry guidance. No write, attachment download, wallet, Composio or Assistant-delegation tool is used.
