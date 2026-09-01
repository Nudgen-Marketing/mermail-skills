# Newsletter brief tool contract

Read this reference when constructing MCP calls for newsletter discovery, bounded body reads, organization moves, or custom-label definitions within the newsletter-brief skill.

## Tool ownership

This skill is a cross-domain persona. It does not own any MCP tools. All tools are borrowed from other skills:

| Intent | Tool | Owning skill |
| --- | --- | --- |
| List mailboxes | `list_mailboxes` | `mermail-administer-workspace` |
| Discover newsletters | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Read newsletter body | `get_email`, `get_email_context` | `mermail-manage-inbox` |
| Read full thread | `get_thread` | `mermail-manage-inbox` |
| Mark as read | `update_email`, `bulk_mark_emails_read` | `mermail-manage-inbox` |
| Move to folder | `move_email`, `bulk_move_emails`, `list_folders` | `mermail-manage-inbox` |
| Create label | `list_custom_labels`, `create_custom_label` | `mermail-manage-inbox` |
| Download attachment | `download_attachment` | `mermail-manage-inbox` |
| Confirm destructive | `prepare_destructive_action` | shared |

There is no `translate_email`, `detect_language`, `summarize_newsletter`, `compile_brief`, or `unsubscribe` tool. Translation and summarization happen in the agent after safe, bounded Mermail reads.

## Native MCP envelope

Pass `query` as a native JSON object; never stringify it:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {}
}
```

## Newsletter discovery

Find recent newsletters by time window:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "read": false,
    "date_start": "2026-08-25T00:00:00Z",
    "sortColumn": "date",
    "sortDirection": "DESC",
    "limit": 30,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Search by sender domain for known newsletter senders:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "sender": "@substack.com",
    "date_start": "2026-08-25T00:00:00Z",
    "limit": 20,
    "metadata_only": true
  }
}
```

`list_emails` supports page/limit (1-100), folder, thread id, category, custom label, read/starred state, and separate sort column/direction. `search_emails` adds free text, sender, recipient, subject, attachment presence, and ISO date range.

## Newsletter body read

After selecting exact email ids, read one newsletter body:

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

`metadata_only: true` omits body, snippet, raw headers, and threat URLs. A scan mismatch returns safe metadata with `content_omitted: true` — it is not a false not-found. Mark such newsletters as "partially read" in the brief.

For multipart newsletters where thread context matters, use `get_email_context` with a bounded limit (default 20) and follow `next_cursor` only if older content is needed.

## Organization moves

After delivering the brief, optionally move processed newsletters:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "body": { "folderId": "archive" }
}
```

For multiple newsletters:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "ids": ["EMAIL_1", "EMAIL_2", "EMAIL_3"],
    "folderId": "archive"
  }
}
```

Call `list_folders` before move operations. Do not infer a folder id from its display name. Freeze the exact deduplicated id set before calling `bulk_move_emails`.

## Custom-label definition

Create a label for tracking digested newsletters (admin-only):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "name": "Newsletter-Digested",
    "rules": "Messages from recurring subscription senders that have been processed into a periodic brief",
    "color": "#4A90D9"
  }
}
```

A mailbox supports at most 20 custom-label definitions. `name` must be 1-80 characters, `rules` 1-500 characters, and `color` up to 32 characters. These tools manage AI classification definitions — they do not manually attach labels to existing email.

## Limits

| Limit | Value |
| --- | --- |
| Newsletter body cap | 10,000 characters (default) |
| Discovery page size | 1-100 (default 30) |
| Context window | 1-50 messages (default 20) |
| Attachment download | 1 MiB MCP binary limit |
| Custom-label definitions per mailbox | 20 |

## Error handling

| Status | Action |
| --- | --- |
| 400 | Correct argument shape only; do not change targets |
| 401/403 | Stop for authentication, workspace scope, or role |
| 402 | Stop for credits |
| 404 | Re-read exact target once; do not substitute |
| 429 | Stop and report rate limiting; do not loop |
| Timeout | Inspect state once; report uncertainty without replay |
