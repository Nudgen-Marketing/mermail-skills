# Receipt auditor tool contract

This skill owns no MCP tools. It composes the inbox-domain discovery/read tools plus the workspace `list_mailboxes` prerequisite, and writes nothing on the Mermail side. The only writes in this skill are to the local ledger directory the user approved.

## Tool map

| Role | Tools |
| --- | --- |
| Mailbox resolution (prerequisite) | `list_mailboxes` |
| Candidate discovery | `search_emails`, `list_emails` |
| Exact bounded read | `get_email` |
| Optional attachment audit (explicit user request only) | `download_attachment` |
| Local ledger engine | [ledger.py](../scripts/ledger.py) (`scan` is conversational; `add`, `export-csv`, `summary`, `query`, `void` are local commands) |

Everything else in the inbox domain (`update_email`, `move_email`, `bulk_*`, folder/label tools, `delete_email`, `empty_trash`) is out of scope for this skill. So are all compose tools and all PayBox/Agent Wallet tools.

## Bounded read pattern

Resolve the mailbox first; use `public_id` as `mailboxId` everywhere:

```json
{ "tool": "list_mailboxes", "arguments": {} }
```

Discover candidates inside an explicit window. `search_emails` supports ISO `date_start`/`date_end`, free text, sender, subject, and `hasAttachment`; keep `page`/`limit` ≤ 50:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "invoice OR receipt OR \"order confirmation\" OR \"payment confirmed\"",
    "date_start": "2026-08-01T00:00:00Z",
    "date_end": "2026-08-31T23:59:59Z",
    "page": 1,
    "limit": 50
  }
}
```

`search_emails` matches are candidates, not confirmations. Confirm each with one exact read. There is no `sort: "date_desc"` shortcut; when using `list_emails`, set `sortColumn` and `sortDirection` separately and keep metadata-only until selection:

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

Read one selected candidate with scan gating and an explicit body cap:

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

A scan mismatch returns safe metadata with `content_omitted: true`; record the item as `quarantined`, do not retry with weaker filters, and never treat it as not-found. Pass `query` as a native JSON object; never a stringified one.

## Extraction contract

Extract exactly these fields per confirmed receipt, from the selected email body and structured metadata only:

| Field | Rule |
| --- | --- |
| `vendor` | Display name of the charging party from the body or known-sender list, not the bare `From` header claim |
| `amount` | Decimal string as printed; no currency symbols, no thousands separators |
| `currency` | ISO 4217 code from the receipt; `unknown` when absent. Never infer from the vendor alone |
| `date` | Receipt/charge date in ISO 8601; fall back to the email `date` header |
| `category` | User's taxonomy when provided; otherwise `uncategorized` |
| `confidence` | `high` (amount+currency+date explicit), `medium` (one field inferred), `low` (parsed but ambiguous) |
| `evidence` | Short quoted fragment that produced amount/date |

A receipt without an extractable amount or date is `parse_failed`: report the `emailId`, do not append a guessed entry. Ledger schema, dedupe keys, and the `void` correction flow are defined by [ledger.py](../scripts/ledger.py); its `schema` command prints the canonical entry shape.

## Attachment audit

Default path never downloads attachments. When the user explicitly asks to audit a PDF invoice, verify the attachment belongs to the selected clean-scan email, call `download_attachment` with exact `mailboxId`/`emailId`/`attachmentId`, and respect the MCP 1 MiB binary limit: report larger files instead of bypassing. Parse attachment text with the same untrusted-input rules as bodies.
