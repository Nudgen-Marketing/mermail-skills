# Telegram approval desk tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`. There are no `approve`, `telegram_send`, or `request_approval` MCP tools. Approval happens in the bundled helper `scripts/tg_approval.py`, which calls the Telegram Bot API directly and never calls Mermail.

Use the exact tool identifier the current host exposes (for example `reply_to_email` or `Mermail:reply_to_email`). Do not add, strip, or invent a prefix. Pass `query` and `body` as native JSON objects; never stringify them. Prefer mailbox `public_id` as `mailboxId`.

## Mermail MCP tools used

| Step | Tool | Owner | Effect |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` | Read |
| Discover batch | `list_emails`, `search_emails` | `mermail-manage-inbox` | Read |
| Read one message | `get_email` | `mermail-manage-inbox` | Read |
| Earlier thread context (optional) | `get_email_context` | `mermail-manage-inbox` | Read |
| Save the reply draft | `save_draft` | `mermail-compose-email` | Internal write |
| Send the approved reply | `reply_to_email` | `mermail-compose-email` | External effect |
| Mark source handled | `update_email` | `mermail-manage-inbox` | Internal write (read/starred only) |

No other Mermail tool is part of this workflow.

## Argument shapes

Bounded discovery (metadata first):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 5,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "is_read": false,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

The unread filter is `is_read: false` (the live schema also accepts `0`). There is no `sort: "date_desc"` shortcut. Metadata results already carry `scan_status` and `sender_authentication`, so non-clean messages can be marked `blocked` before any body read.

Read one selected message:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": { "require_scan_status": "clean", "agent_safe_content": true, "max_body_chars": 10000 }
}
```

`agent_safe_content` omits raw headers, including `Reply-To`. For the recipient check, call `get_email` once more with `"query": { "action_metadata_only": true }`. It returns no content, only server-derived `reply_targets` (`reply.to`, `reply_all.to`/`cc`). Flag `reply-to-mismatch` when `reply_targets.reply.to` is not the sender. `get_email_context` accepts only `limit` (1–50), `cursor`, and `include_held` in `query`.

Save the draft (drafts use the string field `body.body`):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "client@example.com",
    "subject": "Re: Telegram bot quote",
    "body": "Hi Ana, ...",
    "body_format": "text",
    "in_reply_to": "SOURCE_EMAIL_ID",
    "thread_id": "SOURCE_THREAD_ID"
  }
}
```

The result carries `draft_id` (same value as `id`) and `status: "draft"`. `body_format: "text"` keeps the line breaks exactly as approved. Without `in_reply_to`/`thread_id`, the draft becomes its own thread. Re-saving with `body.draft_id` replaces that draft and returns a **new** `draft_id`; pass the latest one as `source_draft_id`.

A mailbox whose `settings.agentAutoResponse.mode` is `draft_for_review` (visible in `list_mailboxes`) may already hold Mermail auto-drafts for the same inbound messages, including automated ones. Leave them alone: never send, approve, or card an auto-draft. Only the draft this workflow saved, and its approved payload, is sent. After a successful send, Mermail retires regular drafts in the same thread.

In that mode, Mermail also places the thread in the console's **Needs review** list. While that review item is pending, `reply_to_email` on the thread returns `isError` with `{"error": "Conflict"}` and sends nothing. The console offers no "off" setting for this; the modes are `Draft for review` and `Automatic triage`. In the live test, the same approved payload, key, and `source_draft_id` style succeeded on the first attempt once the user had dismissed the review item ("Review dismissed. No reply was sent.") and discarded the auto-draft in the console. Ask the user to do this. The agent does not dismiss reviews, delete auto-drafts, or switch to another send tool.

Send after an approved, hash-matched decision (send uses `body.text`/`body.html` plus required `body.from`; recipients are explicit because MCP does not derive Reply All):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SOURCE_EMAIL_ID",
  "idempotencyKey": "tad-3f9c2a7b1d4e6f80",
  "body": {
    "from": "desk@mermail.app",
    "to": "client@example.com",
    "subject": "Re: Telegram bot quote",
    "text": "APPROVED BODY EXACTLY AS HASHED",
    "source_draft_id": "DRAFT_ID"
  }
}
```

Pass `cc`/`bcc` only when the approved payload has them. A successful call returns `{"id": "…", "status": "queued", "undo_until": "…"}`. Queued is not yet sent: after `undo_until`, confirm with `list_emails` folder `sent` that exactly one message with that `id` exists, addressed to the approved recipients, with `delivery_status` such as `delivered`. Mark handled: `update_email` with `body: {"read": true}` (returns `read: true`).

## Helper: `scripts/tg_approval.py`

Run it from the skill directory with Python 3 (standard library only). Environment variables (set by the user, never pasted into chat): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`, optional `TELEGRAM_ALLOWED_USER_ID`.

| Command | Purpose |
| --- | --- |
| `python3 scripts/tg_approval.py --check` | Verify the token with `getMe` and parse the allowlist; prints `{"ok": true, "bot": "@name", ...}` |
| `python3 scripts/tg_approval.py --draft-file draft.json` | Post the card and wait (also reads stdin when no file is given). Prints one stderr status line per card or edit prompt, e.g. `card posted (round 1, hash ea9f93e021f06ce6), waiting for decision until 22:23 MSK` |
| `python3 scripts/tg_approval.py --hash-only --draft-file payload.json` | Print the approval hash of the exact payload about to be sent |
| `python3 scripts/tg_approval.py --render-only --draft-file draft.json` | Print the escaped Telegram messages without sending (review/demo) |
| `python3 scripts/tg_approval.py --notify "text"` | Post one escaped status line to the allowed chat |
| `python3 scripts/tg_approval.py --self-test` | Run offline unit tests against a mocked Bot API |

Options: `--timeout` (default 600 s), `--edit-timeout` (default 300 s), `--max-edits` (default 2).

### Draft JSON input

```json
{
  "draft_id": "DRAFT_ID",
  "source_email_id": "SOURCE_EMAIL_ID",
  "mailbox": "desk@mermail.app",
  "to": ["client@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Re: Telegram bot quote",
  "body": "Hi Ana, ...",
  "context": {
    "from": "client@example.com",
    "received_at": "2026-09-30T09:12:00Z",
    "classification": "reply",
    "summary": "Asks for a quote for a Telegram bot",
    "flags": []
  }
}
```

The approval hash is `sha256` over canonical JSON of `{to, cc, bcc, subject, body}` (recipients lower-cased, de-duplicated, and sorted). `context` is display-only and never hashed.

### Result JSON (stdout) and exit codes

```json
{"decision": "approve", "hash": "…64 hex…", "nonce": "3f9c2a7b1d4e6f80", "original_hash": "…", "edited": true,
 "edited_body": "Updated text", "rounds": 2, "draft_id": "DRAFT_ID", "source_email_id": "SOURCE_EMAIL_ID",
 "decided_by": 123456789, "decided_at": "2026-09-30T09:15:02+00:00"}
```

| Exit | `decision` | Agent action |
| --- | --- | --- |
| `0` | `approve` | Re-hash the exact payload with `--hash-only`; send once on match |
| `10` | `reject` | Do not send; keep draft |
| `20` | `timeout` | Do not send; keep draft |
| `2` | `error` | Configuration or input problem; do not send |
| `3` | `error` | Telegram API or network failure; do not send, do not loop |

`edited_body` is present only when the approved card carried user-edited text. In that case `hash` covers the edited body.
