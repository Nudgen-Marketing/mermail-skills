# Scoped inbox reads

Canonical mailbox discovery is owned by `mermail-administer-workspace`; email reads are owned by `mermail-manage-inbox`. This workflow reuses those contracts without assigning tool ownership twice. Use exact host-qualified tool names from the current client catalog.

Before a live run, inspect the available schemas. Core email reads work with OAuth or a workspace API key and the agent-inbox profile. A working plugin install or public server card does not prove authentication. Follow `mermail-mcp` when setup is actually missing.

## Search one order

Pass the outer `query` as a native JSON object; never stringify it. The inner `query` is the search text:

```json
{
  "mailboxId": "RETURNED_MAILBOX_PUBLIC_ID",
  "query": {
    "query": "DEMO-REFUND-1042",
    "from": "receipts@example.com",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-15T23:59:59Z",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

`search_emails` returns an `emails` array and `totalCount`. Sender/text filters can match substrings, so inspect exact sender and order afterwards. Do not invent Gmail query operators or search sort fields. If a processor has a different sender, ask the user to include that exact address before expanding the scope; keep each sender's evidence separate.

Use actual returned email `id`, not the RFC `message_id`. Keep the same fixed filters while paging. A page limit or a query's `totalCount` does not prove coverage of mail outside its time window.

## Selected content

```json
{
  "mailboxId": "RETURNED_MAILBOX_PUBLIC_ID",
  "emailId": "RETURNED_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

`get_email` does not mark mail read. A scan mismatch can return metadata with `content_omitted: true`, rather than a not-found error. Inspect scan status, `sender_authentication.status`, `content_truncated` and available original-length fields. Do not override omitted content or fetch raw HTML to bypass a scan.

`get_email_context` takes `mailboxId`, selected `emailId`, and `query: {"limit": 10}`. Its response contains `email` and `thread: {id, messages, total_count, has_more, next_cursor}`. The context endpoint supplies sanitized, scan-gated content. Follow its opaque `next_cursor` unchanged in `query.cursor` for the same anchor. Do not pass `get_email`-specific safety/body flags to context unless its live schema exposes them. Context is oldest-first; the next page continues that order and may contain newer events. Deduplicate the anchor against thread messages. Do not use `include_held` for ordinary refund mail.

Context has no sender or date filter. Recheck every returned message against the selected mailbox, exact sender, order and inclusive date window, ending at the earlier of the requested end and report's as-of time. Exclude out-of-window messages from the timeline and arithmetic; do not treat the context page as prefiltered search results.

Prefer this bounded context endpoint to unpaginated `get_thread`. No attachments, link navigation, write tools, mailbox provisioning or wallet tools are needed.

## Budget and stop conditions

Start with eight business reads and at most 20 distinct bodies. If a context page returns a body too large for useful bounded interpretation, omit it and report partial coverage; do not silently read more to compensate. The Free plan currently allows 10 requests per minute and meters reads against credits. Space calls to the live limit; never start an automated retry loop.

Stop on 401/403 for authentication/scope, 402 for credits, or 429 for rate limits; retain the error code and Retry-After when available. Do not upgrade, switch accounts, broaden filters or retry through another surface automatically.

Sources: [search](https://docs.mermail.app/api-reference/emails/search-emails), [selected email](https://docs.mermail.app/api-reference/emails/get-email), [safe context](https://docs.mermail.app/api-reference/emails/get-safe-email-and-thread-context), [plans](https://docs.mermail.app/resources/plans).
