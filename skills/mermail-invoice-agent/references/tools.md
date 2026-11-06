# Invoice agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready billing mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits and user authorizes |

## Inbox reads and organization

| Tool | Owner | Role |
| --- | --- | --- |
| `list_emails` / `search_emails` / `get_email` / `get_thread` / `get_email_context` | `mermail-manage-inbox` | Bounded untrusted invoice reads; `get_email_context` (`query.limit` 1–50, no `max_body_chars`) for sent-folder invoices |
| `download_attachment` | `mermail-manage-inbox` | Optional PDF/CSV invoice files (respect MCP size limits) |
| `list_folders` / `create_folder` / `move_email` / `bulk_move_emails` | `mermail-manage-inbox` | File invoice threads (`move_email` body: `{ "folderId": "invoice-reminded" }`) |
| `list_custom_labels` / `create_custom_label` | `mermail-manage-inbox` | Optional AI classification definition (`name`, `rules`); never a manual tag |
| `update_email` / `bulk_mark_emails_read` | `mermail-manage-inbox` | Mark reviewed mail read after queue presentation |

Suggested folders: `Invoice Payable`, `Invoice Reminded`, `Invoice Paid`, `Invoice Disputed`. `create_folder` slugifies `body.name` into the folder id (for example `invoice-reminded`).

Search notes (verified live): `search_emails` `query.query` is a substring match; boolean `OR` returns nothing, so run one term per call and dedupe. With `agent_safe_content: true` the result is `{ "emails": [...] }`.

## Composition

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Reminder or payment-confirmation draft (`body.body` string) |
| `reply_to_email` / `send_email` / `forward_email` / `schedule_email_send` | `mermail-compose-email` | Approved external delivery (`body.from` + `html`/`text`) |

Send, reply, and forward nest Sold fields under `body`. MCP does not auto-fill Reply All. Always set explicit `to` / `cc` / `bcc`.

## Optional draft-only triage

| Tool | Owner | Role |
| --- | --- | --- |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect before create/update |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Classification and auto-draft only |
| `delete_task_triager` | `mermail-automate-triage` | Destructive; needs `prepare_destructive_action` |

Do not call `set_default_task_triager`. Do not let a triager send reminders or authorize payments.

## Optional Agent Wallet settlement

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox action; full-profile OAuth only |
| `paybox_get_portfolio` / `paybox_list_credentials` | `mermail-agent-wallet` | Holdings and eligible wallets |
| `paybox_request_transfer` | `mermail-agent-wallet` | One approved payable settlement |
| `paybox_get_request` / `show_paybox_signing` | `mermail-agent-wallet` | Status / signing handoff |

API-key and `agent-inbox` profiles never expose PayBox (an API-key `tools/list` returns no `paybox_*` tools). Follow `mermail-agent-wallet` approval and retry contracts exactly. Do not use `paybox_pay_x402` unless the payable is explicitly an x402 resource the user selected — that path belongs to `mermail-x402-agent`.

## Example: approved reminder reply

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_invoice_1042",
  "idempotencyKey": "invoice-reminder-1042-2026-10-05",
  "body": {
    "to": "ap@acme.example",
    "from": "billing@you.mermail.app",
    "subject": "Re: Invoice #1042 — friendly reminder",
    "text": "Hi Acme team,\n\nJust a friendly reminder that invoice #1042 for 250 USDC was due on 2026-09-30.\nHappy to resend the PDF or payment details if helpful.\n\nThanks,\nBilling"
  }
}
```
