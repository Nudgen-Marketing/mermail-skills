# Mermail Tool Reference — mermail-job-pipeline

Verified against the live MCP server (`tools/list` + real calls) on 2026-09-12, Free plan, API-key session. 72 tools exposed; only the ones this skill uses are listed here. Wallet/PayBox tools (`get_paybox_connection`, `get_agent_wallet`, `paybox_get_request`) are **absent from API-key sessions** — they require a full-profile OAuth connection.

## Universal rules

- Every mailbox-scoped tool takes `mailboxId` as its first required argument. Use the mailbox `public_id` (UUID) from `list_mailboxes` — not the email address.
- Read calls take filters inside a `query` object; writes take payloads inside `body`. Both also accept an optional `idempotencyKey`.
- Search fields are relevance filters, **not** authentication. Only `sender_authentication.status === "pass"` (on the detail view) counts as verified.
- Response envelope for list/search: `{ emails: [...], totalCount }`.

## Preflight

```json
// get_api_credit_usage
{ "workspaceId": "<from list_workspaces>" }
// → { plan, limit, used, remaining } — warn and go read-only when remaining < 100

// list_workspaces
{}
```

## Scope

```json
// list_mailboxes
{}
// → items[] with { id, public_id, email, name, settings, can_receive } — prefer public_id everywhere

// get_mailbox
{ "mailboxId": "<public_id>" }

// create_folder — body payload
{ "mailboxId": "<public_id>", "body": { "name": "Job Pipeline" } }
```

## Sweep

```json
// search_emails — filters live inside query; page size 1-100
{
  "mailboxId": "<public_id>",
  "query": {
    "folder": "inbox",
    "from": "greenhouse.io",
    "limit": 25,
    "page": 1
  }
}
// query keys: query (free text), from, to, subject, date_start, date_end,
// folder, is_read, is_starred, category, has_attachment,
// require_scan_status, include_held, metadata_only, page, limit

// get_email
{ "mailboxId": "<public_id>", "emailId": "<id from search>" }

// get_thread
{ "mailboxId": "<public_id>", "threadId": "<thread_id>" }

// get_email_context
{ "mailboxId": "<public_id>", "emailId": "<id>" }

// download_attachment
{ "mailboxId": "<public_id>", "emailId": "<id>", "attachmentId": "<id>" }
```

Detail view fields this skill relies on: `sender`, `sender_authentication.{status,spf,dkim,dmarc,reason}`, `scan_status`, `scan_threats`, `thread_id`, `body`, `attachments`, `read`, `starred`.

## Board (internal writes)

```json
// save_draft — draft-style payload: content goes in a single `body` string (no html/text split)
{
  "mailboxId": "<public_id>",
  "body": { "to": "recruiter@acme.com", "subject": "JOB PIPELINE BOARD", "body": "<markdown board>", "folder": "Job Pipeline" }
}
// include the earlier draft's id in body to replace it on re-save

// create_custom_label — rules-based matching, not per-email labels
{ "mailboxId": "<public_id>", "body": { "name": "jp-interview", "rules": "from:greenhouse.io OR from:lever.co", "color": "blue" } }

// update_email — documented body supports only `read` and `starred`
{ "mailboxId": "<public_id>", "emailId": "<id>", "body": { "read": true, "starred": true } }
```

## Act (external effects — always approval-gated)

```json
// reply_to_email — send payload: to, from, subject, and html and/or text (NOT body)
{
  "mailboxId": "<public_id>",
  "emailId": "<id>",
  "body": { "to": "recruiter@acme.com", "from": "sunyh@mermail.app", "subject": "Re: Interview invite", "text": "Confirmed, see you Thursday." }
}
// returns 202 { id, status }

// schedule_email_send — draft-style payload again
{
  "mailboxId": "<public_id>",
  "body": { "to": "me@personal.com", "subject": "Interview today 10:00", "body": "...", "scheduled_send_at": "2026-09-17T07:30:00+02:00" }
}
```

## Credit costs (all plans)

reads 1 · internal writes 2 · sends and scheduled sends 5. A full sweep on a quiet mailbox ≈ 20–60 credits. Free plan: 1,000/month, 10 RPM, outbound 10/min · 50/hour · 200/day.
