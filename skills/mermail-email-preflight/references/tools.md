# Email preflight tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier, for example `send_email` or `Mermail:send_email`; never add or strip a namespace yourself. Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and capacity (read)

| Tool | Owner | Role | Credits |
| --- | --- | --- | ---: |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the sending mailbox and `public_id` | 1 |
| `get_mailbox` | `mermail-administer-workspace` | Display name and address recipients will see | 1 |
| `get_email_usage` | `mermail-administer-workspace` | Daily/monthly email quota for the batch check | 1 |
| `get_api_credit_usage` | `mermail-administer-workspace` | Remaining API credits before test + real send | 1 |

## Candidate and verification reads (untrusted content)

| Tool | Owner | Role | Credits |
| --- | --- | --- | ---: |
| `list_emails` | `mermail-manage-inbox` | Find drafts (`folder: "drafts"`, `metadata_only: true`) | 1 |
| `search_emails` | `mermail-manage-inbox` | Find a draft by subject; read the test copy and final sends back from Sent | 1 |
| `get_email` | `mermail-manage-inbox` | Read one draft or sent message: `require_scan_status: clean`, `agent_safe_content: true`, `max_body_chars: 10000` | 1 |
| `get_email_context` | `mermail-manage-inbox` | Bounded thread context when the candidate is a reply | 1 |

Attachments: verify presence, filename, type, and size from `get_email` metadata. Use `download_attachment` only if the user asks to inspect a file's contents, and stay under the 1 MiB MCP limit.

## Writes

| Tool | Owner | Role | Effect | Credits |
| --- | --- | --- | --- | ---: |
| `save_draft` | `mermail-compose-email` | Fixed candidate; internal preflight report to the mailbox's own address (`body.body` string; pass `draft_id` when replacing an existing draft and the live schema supports it) | Internal | 2 |
| `send_email` | `mermail-compose-email` | `[TEST]` copy to the user's own address; then one real send per recipient (`body.from`, `body.to`, `body.subject`, `body.html`/`body.text`) | External | 5 |
| `schedule_email_send` | `mermail-compose-email` | Only when the user chooses to split a batch over windows; each schedule needs its own approval | External | 5 |

There is no preflight-specific tool. Do not invent one (`preflight_email`, `validate_links`, `send_test`). Use the tools above plus the host's own HTTP/web-fetch tool, if one exists, for reachability.

## Examples

Find drafts:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "drafts",
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true
  }
}
```

Test copy to the user's own address:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "preflight-test-7f3a9c",
  "body": {
    "from": "events@mermail.app",
    "to": "owner@example.com",
    "subject": "[TEST] You're invited: El Encuentro · 26 Oct · Madrid",
    "html": "<p>Hi Ada,</p><p>…</p><p><a href=\"https://lafamilia.so/ir/encuentro-st\">Save my spot</a></p>"
  }
}
```

Real send, one recipient per call:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "preflight-7f3a9c-2",
  "body": {
    "from": "events@mermail.app",
    "to": "tunde@example.com",
    "subject": "You're invited: El Encuentro · 26 Oct · Madrid",
    "html": "<p>Hi friend,</p><p>…</p>"
  }
}
```

Read the test copy back from Sent:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": { "folder": "sent", "subject": "[TEST] You're invited", "limit": 5 }
}
```
