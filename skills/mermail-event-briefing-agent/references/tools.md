# Event briefing tools

This persona uses existing tools and owns none. The allowlist is `list_mailboxes`, `search_emails`, `list_emails`, `get_email`, and `get_email_context`. Discovery belongs to `mermail-administer-workspace`; the four mail tools belong to `mermail-manage-inbox`.

Use the exact identifier exposed by the host, which may be `Mermail:list_emails` rather than `list_emails`. Inspect the current MCP schemas before constructing calls. Never invent a prefix, filter, URL, or server-side event extraction tool. Pass `query` as a native JSON object, never a JSON-encoded string.

## Resolve a mailbox

Call `list_mailboxes` using the current authenticated connection and its live schema. Select a usable mailbox from the returned records and retain the exact `public_id` as `mailboxId`. If none is available, report that setup is needed; provisioning is outside this read-only skill.

## Candidate metadata

For a user-selected event title, `search_emails` accepts:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "subject": "Harbour Builders Evening",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 20
  }
}
```

The title and Inbox scope here are examples, not mandatory filters. Use an explicitly selected folder when supplied; an Inbox filter also avoids treating sent test messages as received ones. For broader discovery, `list_emails` accepts:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "page": 1,
    "limit": 50,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

State the service's actual default folder scope or pass a user-selected folder supported by the live schema. Do not claim omission of `folder` proves all folders were searched. Follow-up searches may use supported sender, subject, or free-text filters derived from selected events. Message `date_start`/`date_end` filters do not select event dates. Do not use `include_held`; it belongs to active verification workflows.

## Read a selected message

Use the returned Mermail resource `id` as `emailId`, never a subject, event reference, or provider/RFC `message_id`:

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

A scan mismatch may return metadata with `content_omitted: true`. Treat this as a content limitation, not an absent email. Preserve `scan_status`, `sender_authentication` and any truncation signals. Do not infer authentication from raw headers.

## Recover earlier or later context

`get_email_context` takes the selected `mailboxId` and `emailId`. Use `query.limit` of at most 8 for this workflow and reduce it to the remaining body budget. The repository contract returns sanitised, scan-gated messages oldest-first. Its response contains the selected `email` and a `thread` object with `messages`, `total_count`, `has_more`, and `next_cursor`. Count the selected body as well as returned context bodies against the budget. Inspect the live schema for additional supported safety fields rather than assuming the entire `get_email` query transfers unchanged.

Use `thread.has_more` to detect remaining context. To paginate, pass the opaque returned `thread.next_cursor` as `query.cursor`; keep the same selected message. Do not manufacture a cursor or look for it at the top level. Oldest-first means the first page may omit a later cancellation; make the resulting coverage gap explicit if the budget ends before it is reached. Related updates outside that context can require a bounded search.

For full endpoint details, use the owning [inbox contract](../../mermail-manage-inbox/references/tools.md). No additional tools are needed for this briefing. Authentication failures, permission errors or exhausted credits remain setup/coverage limitations; do not switch accounts or buy credits. Respect rate-limit retry guidance only within the remaining call budget; never turn a briefing into continuous monitoring.
