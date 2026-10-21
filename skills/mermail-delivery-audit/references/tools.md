# Read-only tool contract

Use exact host-exposed tool identifiers and native JSON objects, never a
stringified `query`. Inspect live schemas rather than inventing raw-email APIs.

- `list_mailboxes`: select one returned `public_id`; owned by workspace admin.
- `search_emails` / `list_emails`: candidate metadata, owned by inbox management.
- `get_email`: one selected source, owned by inbox management.
- `download_attachment`: exact mailboxId, emailId, attachmentId from that source.
  Binary MCP responses are limited to 1 MiB. Do not work around the limit.

Candidate read query:

```json
{"page":1,"limit":20,"metadata_only":true,"agent_safe_content":true}
```

After selection, `get_email` uses:

```json
{"mailboxId":"MAILBOX_PUBLIC_ID","emailId":"EMAIL_ID","query":{"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}}
```

If `content_omitted` is true, stop reading that source. Do not parse a download
unless the source and attachment are authorized and available under the owning
skill's scan contract. Use the inbox skill's full
[tool contract](../../mermail-manage-inbox/references/tools.md) for argument details.

The helper handles a top-level `multipart/report; report-type=delivery-status`
with one direct DSN part, or explicit raw DSN bytes. Nested forwarded messages
and human-readable prose are not treated as authoritative DSNs. It is a bounded
extractor, not a complete RFC validator or sender-authentication implementation.
DSN field semantics: [RFC 3464](https://www.rfc-editor.org/rfc/rfc3464.html).
