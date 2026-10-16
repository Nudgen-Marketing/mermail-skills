# Licensing desk tools

This persona **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `quote`, `license`, `invoice`, or `split_payout` tools. Map those intents to the real operations below. Pass structured arguments as **native JSON objects**; never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer the mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find the licensing mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Provision one (owner-authorized only) | `create_mailbox` | `mermail-administer-workspace` |
| Find inquiries | `search_emails`, `list_emails` (metadata first, bounded page/limit) | `mermail-manage-inbox` |
| Read one inquiry | `get_email`, `get_email_context`, `get_thread` (scan-clean only) | `mermail-manage-inbox` |
| Desk state (quoted, licensed, needs owner) | `list_folders`, `create_folder`, `move_email` | `mermail-manage-inbox` |
| Draft a quote or confirmation | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send the approved quote or confirmation | `reply_to_email` (top-level `emailId`, `body.from`, explicit `body.to`, `body.text` and/or `body.html`) | `mermail-compose-email` |
| Check the PayBox connection before a payout | `get_paybox_connection` | `mermail-agent-wallet` |
| Resolve the paying credential | `paybox_list_credentials`, `paybox_get_portfolio` | `mermail-agent-wallet` |
| Pay one approved collaborator split | `paybox_request_transfer` (live schema) | `mermail-agent-wallet` |
| Check payout status once | `paybox_get_request` | `mermail-agent-wallet` |
| Price, license ID, split math | `scripts/quote.mjs` (local, no network) | this skill |
| Receipts | `scripts/ledger.mjs` (local, hash-chained) | this skill |

No MCP tool attaches a custom label to an existing message, so desk state lives in folders. `create_folder` slugifies `body.name` (`Licensing Quoted` becomes `licensing-quoted`). Call `list_folders` before creating.

MCP does not auto-fill Reply All. Pass the inquiry sender in `to`; add `cc` only when the owner approves a non-empty set.

## Examples

Bounded discovery (newest inbox metadata; `search_emails` takes the same `query` object plus free text, sender, subject, and date filters from its live schema):

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

Read one selected inquiry:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": { "require_scan_status": "clean", "agent_safe_content": true, "max_body_chars": 10000 }
}
```

Draft a quote:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "supervisor@example.com",
    "subject": "Re: Print inquiry - 1440 3:20 PM",
    "body": "Quote Q-3f1c9a2b7d10 for 1440 \"3:20 PM\" ..."
  }
}
```

Send after exact owner approval:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "body": {
    "from": "licensing@mermail.app",
    "to": "supervisor@example.com",
    "text": "Quote Q-3f1c9a2b7d10 for 1440 \"3:20 PM\" ..."
  }
}
```

File the inquiry:

```json
{ "mailboxId": "MAILBOX_PUBLIC_ID", "emailId": "EMAIL_ID", "body": { "folderId": "licensing-quoted" } }
```

Split payout: read the live `paybox_request_transfer` schema from `tools/list` after `get_paybox_connection`, then pass the credential, chain, asset, recipient, and `amount_decimal` exactly as `quote.mjs --splits` previewed and the owner approved. Do not call `prepare_destructive_action` for `paybox_*` writes.

## Plan and auth caveats

- Free workspaces cap external MCP sends at 10 recipients per request and 10/min, 50/hour, 200/day. A licensing reply has one recipient; never split a recipient set to dodge the limit.
- API-key sessions (`MERMAIL_API_KEY`) cover the inbox steps only. Split payouts require full-profile MCP OAuth with an active PayBox connection; the `agent-inbox` profile never exposes wallet tools.
- Every MCP call debits API credits on the workspace plan.
