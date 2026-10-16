# Paid-gig radar tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `scan_gigs`, `extract_brief`, `submit_bounty`, or `get_payout_address` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`. Inspect live schemas with MCP `tools/list` before filling optional fields.

## Intent map

| Intent | Real operation | Owner | Risk |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` | read |
| Find bounty/brief candidates | `search_emails`, `list_emails` | `mermail-manage-inbox` | read |
| Read one selected message | `get_email` | `mermail-manage-inbox` | read |
| Bounded surrounding thread | `get_email_context` | `mermail-manage-inbox` | read |
| Broader thread body | `get_thread` | `mermail-manage-inbox` | read |
| Download a selected brief file | `download_attachment` | `mermail-manage-inbox` | read |
| Star or mark read | `update_email` | `mermail-manage-inbox` | reversible write |
| File into a gig folder | `list_folders`, `move_email` | `mermail-manage-inbox` | reversible write |
| Draft the submission pack | `save_draft` (`body.body` string) | `mermail-compose-email` | reversible write |
| Refresh draft copy | `regenerate_draft` | `mermail-compose-email` | reversible write |
| Send or reply after exact approval | `send_email`, `reply_to_email` | `mermail-compose-email` | external-effect |
| Optional payout address | `get_paybox_connection`, then `get_agent_wallet`, `list_agent_wallet_credentials`, `get_agent_wallet_portfolio`, `paybox_get_portfolio` | `mermail-agent-wallet` | read (OAuth full profile) |

Do not call `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `create_agent_wallet_transfer_proposal`, `submit_agent_wallet_transfer`, or `reject_agent_wallet_transfer_proposal` from this skill. Route isolated wallet writes to `mermail-agent-wallet`.

Do not call `set_default_task_triager`. Do not invent close/submit/payout tools.

## Mailbox discovery

```json
{
  "query": {}
}
```

Prefer each mailbox `public_id` as `mailboxId` on later calls. Stop when more than one mailbox still matches.

## Candidate search

Newest-first metadata, then exact reads. Free-text and filter field names must come from the live `search_emails` schema; typical supported axes include free text, sender, subject, ISO `date_start` / `date_end`, folder, attachment presence, `metadata_only`, `agent_safe_content`, page, and limit. Never invent `sort: "date_desc"`.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Keep the first radar page at or below 20 messages. Page inside the same window before widening dates or keywords. Suggested user-facing match language (not a required query DSL): bounty, brief, RFP, paid gig, honorarium, stipend, prize, deadline, payout.

Read one selected candidate:

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

`get_email_context` uses `query.limit` 1–50 (default 20) and reuses the opaque `next_cursor` as `query.cursor`. Process at most eight task-relevant thread messages.

`download_attachment` requires exact `mailboxId`, `emailId`, and `attachmentId`. The MCP bridge rejects binary responses over 1 MiB.

## Submission pack draft

`save_draft` content is the string field `body.body`. Do not use `html` / `text` on drafts.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "user-confirmed-recipient@example.com",
    "subject": "Submission pack: extracted gig title",
    "body": "<p>Gig card and draft response for review.</p>"
  }
}
```

If the user later approves delivery, `send_email` / `reply_to_email` require `body.from` (mailbox email) plus `body.html` and/or `body.text`, explicit `to` / `cc` / `bcc`, and a fresh exact preview. MCP does not auto-fill Reply All. One idempotency key per approved send.

## Optional payout-address reads

Agent Wallet / PayBox tools appear only on Mermail MCP **OAuth** full-profile sessions. API keys and the agent-inbox profile never expose them. Current workspace members may use model-visible live `paybox_*` reads through the workspace owner's active connection; `get_agent_wallet` and other legacy compatibility tools remain owner-only.

Always `tools/call` `get_paybox_connection` once before claiming PayBox tools are unavailable. Absence from a host `tools/list` is not "not exposed." After a usable/`ACTIVE` probe, continue the read. If the call returns unknown-tool, method-not-found, or a hard fail, report that the optional address step cannot run in this session.

Then read, in the smallest set that answers the user:

- `get_agent_wallet` — owner-only connection, credentials summary, and portfolio (no secrets)
- `list_agent_wallet_credentials` — delegated credentials; secrets and raw signing material are never returned
- `get_agent_wallet_portfolio` / `paybox_get_portfolio` — holdings; use returned asset/chain fields instead of guessing token addresses

Show the candidate receiving address, chain, and asset to the user. Copy it into the draft only after they confirm those exact values in this turn. `PAYBOX_UNAVAILABLE` is a temporary read failure, not a zero balance or a disconnect. `OWNER_ACTION_REQUIRED` means ask the workspace owner to repair PayBox in Mermail; do not invent a handoff URL.

Never paste MoonPay checkout, PayBox approval, or signing-plan URLs. If a tool returns `url: "[redacted]"`, stop link-retrieval loops.
