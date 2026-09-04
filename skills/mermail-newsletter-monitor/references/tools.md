# Newsletter monitor tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in 	ool-coverage.json; the persona is an orchestrator, not a tool owner.

Pass structured arguments as **native JSON objects**. Never stringify query or ody. Use the exact host identifier (list_emails or Mermail:list_emails). Prefer mailbox public_id as mailboxId.

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| list_mailboxes | mermail-administer-workspace | Discover or confirm the agent mailbox to use for the digest |
| create_mailbox | mermail-administer-workspace | Provision only when the user authorises a new inbox (10 credits; email + 
ame required) |

Do not invent a mailbox address. Reuse an existing ready mailbox before creating a new one.

## Bounded reads

| Tool | Owner | Role |
| --- | --- | --- |
| search_emails | mermail-manage-inbox | Locate unread newsletter candidates; pass query as a native JSON object |
| list_emails | mermail-manage-inbox | Alternate listing when search_emails is unavailable on the host |
| get_email | mermail-manage-inbox | Read one matched email body and metadata |
| get_email_context | mermail-manage-inbox | Read one message plus bounded thread context |
| get_safe_email_and_thread_context | mermail-manage-inbox (host-qualified) | Preferred safe body read; falls back to get_email_context on hosts that do not expose the safe_* form |

Always pass the live schema. Do not call or invent tool names that the live catalog does not expose.

## Folder management and bulk writes

| Tool | Owner | Role |
| --- | --- | --- |
| list_folders | mermail-manage-inbox | Confirm a Digested folder exists |
| create_folder | mermail-manage-inbox | Create Digested only when missing (ody.name, ody.parentId when nested) |
| ulk_mark_emails_read | mermail-manage-inbox | Mark processed newsletter IDs as read |
| ulk_move_emails | mermail-manage-inbox | Move processed newsletters to Digested |

Folder creation is reversible; no prepare_destructive_action token is required. Bulk moves are internal writes.

## Composition

| Tool | Owner | Role |
| --- | --- | --- |
| send_email | mermail-compose-email | One approved digest send (ody.from + ody.html and/or ody.text) |

Pass explicit 	o; pass cc and cc only when their intended sets are non-empty. The digest sends to one user-specified recipient, so the Free-plan cap of 10 To+Cc+Bcc units per request is never approached.

## Argument shapes

Search and list calls accept query and ody as native JSON objects. There is no sort: "date_desc" shortcut; pass sortColumn: "date" and sortDirection: "DESC".

`json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "is": "unread",
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
`

Do not pass "query": "{\"sortColumn\":\"date\"}".

For the digest send, follow the canonical compose shape:

`json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "newsletter-digest-2026-09-04-a1",
  "body": {
    "to": "user@example.com",
    "from": "agent@mermail.app",
    "subject": "Your Newsletter Digest — 2026-09-01–2026-09-04",
    "html": "<p>...</p>",
    "text": "..."
  }
}
`

Reuse the idempotency key only for the identical approved payload. Never generate a new key to force a replay.