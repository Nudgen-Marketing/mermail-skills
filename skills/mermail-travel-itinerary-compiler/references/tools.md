# Tools

This skill does not own any MCP tool. It composes the tools below through the live `mermail` MCP server (`https://console.mermail.app/mcp`). Each tool here is owned by another skill; cross-reference its `references/tools.md` for the full argument envelope, errors, and risk class.

## Conventions

- Pass `query` and `body` as **native JSON objects**. Never stringify them.
- Use the exact tool identifier exposed by the current host. Claude may expose `Mermail:list_mailboxes`; another host may use a different prefix or no prefix. Do not manually add, strip, or invent a prefix.
- Prefer the mailbox `public_id` returned by `list_mailboxes` as `mailboxId`.
- Free-plan sends allow at most 10 To plus Cc plus Bcc per request, plus per-minute, per-hour, and per-day ceilings. Surface `Retry-After` and fail closed on rate limits.

## Composed tools

### `list_mailboxes`

Owner: `mermail-administer-workspace`.

Purpose: resolve the user's mailbox and prefer `public_id`.

```json
{}
```

### `search_emails` (vendor discovery sweep)

Owner: `mermail-manage-inbox`.

Purpose: discover confirmation candidates per category. Run **five** parallel calls, one per category, each with `require_scan_status: "clean"`, `metadata_only: true`, `agent_safe_content: true`, and the scope's `date_start` and `date_end`.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "united.com OR delta.com OR britishairways.com OR aa.com OR lufthansa.com",
    "subject": "itinerary OR booking OR confirmation OR eTicket OR reservation",
    "date_start": "2026-03-01T00:00:00Z",
    "date_end": "2026-06-01T23:59:59Z",
    "require_scan_status": "clean",
    "metadata_only": true,
    "agent_safe_content": true,
    "limit": 50
  }
}
```

Per-category `from` allowlist:

| Category | Sample `from` allowlist |
| --- | --- |
| `flight` | united.com, delta.com, britishairways.com, aa.com, lufthansa.com, singaporeair.com, cathaypacific.com, ANA, JAL, AirAsia, VietJet, VietnamAirlines |
| `hotel` | hyatt.com, marriott.com, ihg.com, hilton.com, accor.com, booking.com, airbnb.com, agoda.com, expedia.com, hotels.com |
| `car` | hertz.com, avis.com, enterprise.com, budget.com, sixt.com, turo.com |
| `restaurant` | opentable.com, resy.com, sevenrooms.com, tock.com |
| `activity` | viator.com, getyourguide.com, klook.com, pelago.com, headout.com

If a vendor domain is unknown, omit it from the `from` allowlist and rely on `subject` keyword match plus a fallback `list_emails` sweep.

### `list_emails` (fallback discovery)

Owner: `mermail-manage-inbox`.

Purpose: catch narrow window after the sweep missed vendors. Run at most once per compile.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 200,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "date_start": "2026-03-01T00:00:00Z",
    "date_end": "2026-06-01T23:59:59Z"
  }
}
```

### `get_email` (body fetch)

Owner: `mermail-manage-inbox`.

Purpose: fetch one confirmation body. Cap `max_body_chars` at 10000.

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

If `content_omitted: true`, treat the email as metadata-only and tag the resulting booking as `low` confidence. Do not parse untrusted body content.

### `get_email_context` (optional)

Owner: `mermail-manage-inbox`.

Purpose: bounded conversation context for an ambiguous confirmation. Use only when a single-thread booking exchange is needed and `get_email` body is insufficient.

### `save_draft` (default external effect)

Owner: `mermail-compose-email`.

Purpose: save the compiled itinerary draft. Always prefer this over `send_email`.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "user@example.com",
    "subject": "Itinerary: Tokyo Mar 14 – Mar 21 (v1)",
    "html_body": "<table>...</table>",
    "text_body": "TRIP: Tokyo ...\n...",
    "attachments": [
      {
        "filename": "itinerary.ics",
        "mime_type": "text/calendar",
        "content": "BASE64_ICS"
      }
    ]
  },
  "idempotencyKey": "sha256(trip_id + ':' + version)"
}
```

Confirm the live schema field names. The compose-email `references/tools.md` documents the canonical key shapes; favor `to`, `subject`, `html_body`, `text_body` over a single `body` field, and only attach `.ics` when the host accepts attachments on `save_draft`.

### `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send` (approved only)

Owner: `mermail-compose-email`.

These are external-effect operations and require fresh, exact user approval before each call. Never combine an approval for one with another. Never use a new idempotency key to retry an ambiguous external effect.

## Native envelope reminder

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {},
  "body": {},
  "idempotencyKey": "optional-stable-key"
}
```

Do not pass `"query": "{\"from\":\"united.com\"}"`.

## Plan and scope caveats

- Free plan: 1 mailbox, 1 API key, lower credit budgets, and the 10-recipient per request ceiling on `send_email`, `reply_to_email`, `forward_email`, and `schedule_email_send`. Larger workspaces are unaffected but must still observe per-minute, per-hour, and per-day ceilings.
- `agent-inbox` profile exposes only the read tools (`list_mailboxes`, `search_emails`, `list_emails`, `get_email`, `get_email_context`). When the host is configured with the restricted profile, `save_draft` is unavailable; in that case the skill must surface "draft unavailable in restricted profile" and route the user to a full-profile install.
- All five `search_emails` calls plus up to ten `get_email` calls in step 6 may run in parallel subject to the workspace rate limit. Default concurrency: 5 searches plus 10 fetches per run.