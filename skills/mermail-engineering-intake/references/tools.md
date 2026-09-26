# Engineering intake tool routing

This workflow **uses** read tools owned by other official skills. Do not add these tools under `mermail-engineering-intake` in `tool-coverage.json`.

Use the exact identifier exposed by the current host. Claude may expose `Mermail:get_email`; another host may use a different namespace or bare `get_email`. Do not add, remove, or invent a prefix. At the MCP protocol boundary the catalog names are bare.

Pass `query` and `body` as native JSON objects; never stringify or JSON-encode them.

## Routed tool map

| Intake step | Tool | Canonical owner |
| --- | --- | --- |
| Resolve one mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| List newest candidate metadata | `list_emails` | `mermail-manage-inbox` |
| Search candidate metadata | `search_emails` | `mermail-manage-inbox` |
| Read one selected message | `get_email` | `mermail-manage-inbox` |
| Reply only after preview and approval | `reply_to_email` | `mermail-compose-email` |

Intake itself is read-only. Do not call attachment, browser, Composio, destructive, delivery, or PayBox / Agent Wallet tools during classification.

## Bounded discovery

Use mailbox `public_id` as `mailboxId`. For a newest-message scan:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

For `search_emails`, use only live-schema filters authorized by the user, such as free text, sender, recipient, subject, date range, folder, state, category, `page`, and `limit`. Search results establish candidates, not sender identity.

Read one exact selected message:

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

A scan mismatch may return safe metadata with `content_omitted: true`. Treat this as `REVIEW`, not as a missing message, and do not retry without the scan gate.

## Reply boundary

Do not call `reply_to_email` during intake. First show the exact To/Cc/Bcc, subject, and body, then stop. After fresh approval in a later user turn, follow `mermail-compose-email` and its live schema, recipient-limit, idempotency, and uncertain-write rules. The approved payload must remain unchanged.

Mermail business tools may use OAuth or the repository's documented API-key fallback, subject to the selected profile, role, workspace scope, plan, credits, and RPM limits. PayBox remains full-profile OAuth-only and is outside this workflow.
