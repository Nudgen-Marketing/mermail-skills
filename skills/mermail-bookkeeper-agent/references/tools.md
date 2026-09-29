# Bookkeeper tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and mail reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the single receipts mailbox (`public_id`) |
| `list_emails` | `mermail-manage-inbox` | Bounded candidate discovery when no search terms fit |
| `search_emails` | `mermail-manage-inbox` | Primary candidate discovery (sender, subject tokens, date window) |
| `get_email` | `mermail-manage-inbox` | Full content extraction per candidate |

## Digest draft and approved send

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Monthly digest as a reviewable draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Only after an exact preview and a fresh user approval naming recipients |

This skill calls no destructive tools and no PayBox / Agent Wallet tools. Never call `prepare_destructive_action` from this workflow; there is nothing destructive to prepare.

## Bounded reads

- Use `list_emails` with `metadata_only=true` for cheap candidate discovery, then `get_email` only for candidates worth extracting.
- Prefer `agent_safe_content=true` on read calls so sensitive metadata is stripped and bodies arrive as bounded plain text.
- Cap one run at 60 `get_email` calls (two batches of 30). If candidates remain, say so and continue in the next run instead of widening the window silently.
- Keep search windows explicit: named date range, or the last 30 days by default. Never scan all folders unbounded.

## Examples

Candidate discovery:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "from": "receipts@stripe.com",
    "receivedAfter": "2026-09-01",
    "receivedBefore": "2026-10-01"
  }
}
```

Digest draft (string `body.body`, not `html`/`text`):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "owner@example.com",
    "subject": "Spend digest — September 2026",
    "body": "<p>Totals, top merchants, and flagged anomalies for September 2026.</p>"
  }
}
```

Do not pass `"query": "{\"from\":\"receipts@stripe.com\"}"`.
