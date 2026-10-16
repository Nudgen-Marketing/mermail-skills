# Split desk tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or a host-qualified form such as `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`. Read live schemas from `tools/list` before the first write.

## Mailbox and receipts

| Tool | Owner | Role | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the split mailbox and its `public_id` / email | read |
| `create_mailbox` | `mermail-administer-workspace` | Only when no mailbox fits and the owner authorizes it (10 provision credits; `email` + `name` required) | write |
| `search_emails` | `mermail-manage-inbox` | Find tagged receipts, metadata only | read |
| `get_email` | `mermail-manage-inbox` | Read one receipt, scan-gated and bounded | read |
| `download_attachment` | `mermail-manage-inbox` | Optional receipt attachment of the selected email, ≤ 1 MiB | read |
| `list_folders` / `create_folder` / `bulk_move_emails` | `mermail-manage-inbox` | Optional tidy-up after the statement is sent | internal write |

Find tagged receipts (search returns `{ "emails": [...], "totalCount": N }`):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "split:lisbon",
    "date_start": "2026-09-01T00:00:00.000Z",
    "date_end": "2026-10-05T23:59:59.000Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 50
  }
}
```

Read one receipt:

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

A scan mismatch returns safe metadata with `content_omitted: true`; record the line as `excluded` (`scan_not_clean`), not as missing.

## Statement

| Tool | Owner | Role | Risk |
| --- | --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Statement draft; content is the string `body.body` | internal write |
| `send_email` | `mermail-compose-email` | Approved statement; `body.from` + `body.text` and/or `body.html` | external effect |
| `schedule_email_send` | `mermail-compose-email` | Optional approved reminder; future ISO `body.scheduled_send_at` | external effect |

Statement draft:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "oliver@example.com, alice@example.com, bob@example.com",
    "subject": "[split:lisbon] Settle-up statement v1",
    "body": "Plain-text statement from workflows.md"
  }
}
```

Approved send (one call, one stable key):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "split-lisbon-2026-10-05-v1",
  "body": {
    "from": "split-desk@mermail.app",
    "to": ["oliver@example.com", "alice@example.com", "bob@example.com"],
    "subject": "[split:lisbon] Settle-up statement v1",
    "text": "Plain-text statement from workflows.md",
    "source_draft_id": "DRAFT_ID"
  }
}
```

Free workspaces: at most 10 To+Cc+Bcc recipients per request, 10/minute, 50/hour, 200/day. On `email_send_recipient_limit_exceeded`, `email_send_rate_limit_exceeded`, or `email_send_rate_limit_unavailable`, stop and report; never auto-retry or reshape the recipient set.

## Optional USDC settle-up (Agent Wallet / PayBox)

All PayBox contracts belong to `mermail-agent-wallet`; read its `references/workflows.md` Transfer section before writing. Requires full-profile Mermail MCP **OAuth**; API keys and `?profile=agent-inbox` never expose these tools.

| Tool | Owner | Role | Risk |
| --- | --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | **Always** call once first; follow `connect_handoff` / `reauth_handoff` if returned | read |
| `paybox_list_credentials` | `mermail-agent-wallet` | Pick a chain-compatible credential; preserve an explicit `credential_id` | read |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Read the USDC asset/token and balance on the chosen chain | read |
| `paybox_request_transfer` | `mermail-agent-wallet` | One owner-approved transfer per `owner_pays` line | wallet write |
| `show_paybox_signing` | `mermail-agent-wallet` | Only for real `pending_signature`, with the returned `signing_handoff.invocation_id` | handoff |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one known `request_id` once when the owner asks or confirms signing | read |

Pass `paybox_request_transfer` arguments exactly as the live schema requires; take the token from `paybox_get_portfolio` and never invent amount conversion. Do **not** call `prepare_destructive_action` for `paybox_*`. Do not fall back to `create_agent_wallet_transfer_proposal`.
