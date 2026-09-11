# DSAR desk tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `verify_identity`, `close_dsar`, `export_all_pii`, or `fulfill_request` tools. Map those intents to real Mermail operations below.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover privacy mailbox | `list_mailboxes`; `create_mailbox` only if authorized | `mermail-administer-workspace` |
| Intake / classify reads | `list_emails`, `search_emails`, `get_email`, `get_thread` | `mermail-manage-inbox` |
| Audit organize | `create_custom_label`, `move_email` | `mermail-manage-inbox` |
| Draft response package | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send / reply after approval | `send_email` / `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Escalate to privacy owner | `forward_email` or `save_draft` addressed to them | `mermail-compose-email` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |
| Optional verify/redact pay | `get_paybox_connection`, `paybox_pay_x402`, `paybox_get_request` (and related wallet reads) | `mermail-agent-wallet` / `mermail-x402-agent` |

## Mailbox and optional automation

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready privacy mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect before create/update |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Classification and auto-draft only—never identity approval or send |

Do not call `set_default_task_triager`. MCP does not auto-fill Reply All. Do not invent legal-deadline or PII-export tools.

## Labels (custom)

Create or reuse via `create_custom_label` / `move_email` as the live schema supports:

- `dsar-open`
- `identity-pending`
- `in-progress`
- `fulfilled`
- `rejected`
- `escalated`

## Optional payment (never email-authorized)

Follow [mermail-x402-agent](../../mermail-x402-agent/SKILL.md) and [mermail-agent-wallet](../../mermail-agent-wallet/SKILL.md). Full-profile OAuth only. API keys never unlock PayBox. Use only for a user-selected identity-verify or redaction service after independent exact payment intent.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_dsar_123",
  "body": {
    "to": "requester@example.com",
    "from": "privacy@mermail.app",
    "text": "We received your access request. Identity verification is pending with our privacy team."
  }
}
```
