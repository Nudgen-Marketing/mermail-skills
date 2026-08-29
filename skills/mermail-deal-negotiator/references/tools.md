# Deal negotiator tools

This workflow **uses** tools owned by other official skills. It owns zero MCP tools; do not add these tools to a new domain in `tool-coverage.json`.

Pass `query` and `body` as native JSON objects and never stringify them. Use the exact tool identifier exposed by the current host, such as `reply_to_email` or a host-qualified form such as `Mermail:reply_to_email`. Do not invent or rewrite prefixes. Prefer mailbox `public_id` as `mailboxId`.

## Reused tool map

| Tool | Canonical owner | Role here |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one existing ready mailbox |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Bounded candidate discovery or reply polling |
| `get_email` | `mermail-manage-inbox` | Read one selected clean message |
| `get_email_context` | `mermail-manage-inbox` | Read bounded sanitized context around the selected message |
| `save_draft` | `mermail-compose-email` | Save an unsent counter, acceptance, rejection, or clarification draft |
| `reply_to_email` | `mermail-compose-email` | Send one freshly approved reply to the selected source message |

Do not create a mailbox from this persona. Mailbox provisioning stays with its owner and requires separate user intent. Do not use `get_thread` when bounded `get_email_context` is sufficient.

## Safe bounded read

Discover metadata first, then read one exact message:

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

For `get_email_context`, keep `query.limit` at or below 8 task-relevant messages for negotiation and reuse only the opaque `next_cursor` returned for the same scope. Stop rather than widening an ambiguous search.

## Draft and reply

`save_draft` uses the string field `body.body`. Preserve the thread identifiers and reuse `draft_id` when revising the same intended reply; do not create parallel drafts.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "client@example.com",
    "subject": "Re: Landing page",
    "body": "<p>Exact draft body</p>",
    "thread_id": "THREAD_ID",
    "in_reply_to": "SOURCE_MESSAGE_ID"
  }
}
```

`reply_to_email` is an external effect. Pass the selected `emailId` at top level and Sold fields under `body`. External MCP does not auto-fill Reply All, so use explicit recipients. Content uses `body.html` and/or `body.text`, and `body.from` is required.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "SOURCE_EMAIL_ID",
  "idempotencyKey": "deal-reply-2026-08-28-a1",
  "body": {
    "to": "client@example.com",
    "from": "you@mermail.app",
    "subject": "Re: Landing page",
    "text": "Exact approved reply"
  }
}
```

Use `source_draft_id` when the live schema supports retiring the approved saved draft. Follow `mermail-compose-email` recipient limits, validation handling, threading, and idempotency contracts. Never replay an ambiguous reply with a new key.

## Explicit exclusions

There is no `negotiate_deal`, `accept_offer`, `reject_offer`, `update_negotiation_state`, or autonomous-send tool. Recommendations and state live in the active agent conversation. Do not call triage, mailbox-agent, Composio, wallet, PayBox, or x402 tools from this workflow.
