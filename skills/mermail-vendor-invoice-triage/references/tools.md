# Vendor invoice triage tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json` `domains`.

There are no `pay_invoice`, `mark_paid`, or `close_invoice` tools. Map those intents to real Mermail operations below.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find invoice candidates | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read one invoice / thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Inspect PDF/attachment metadata | `get_email` then optional `download_attachment` (≤1 MiB MCP bridge) | `mermail-manage-inbox` |
| Draft acknowledgment / clarify | `save_draft` (`body.body` string while revising) | `mermail-compose-email` |
| Send approved reply | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Handoff to finance human | `forward_email` or `save_draft` addressed to them | `mermail-compose-email` |
| Organize | `list_folders`, `create_folder`, `move_email`, `bulk_move_emails`, `update_email` | `mermail-manage-inbox` |
| Recurring classification rules | `list_custom_labels`, `create_custom_label` (admin; name + rules) | `mermail-manage-inbox` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |
| Payment (optional, separate) | Hand off to `mermail-agent-wallet` live `paybox_*` after user confirmation | `mermail-agent-wallet` |

## Mailbox and automation

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready AP / billing mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_task_triagers` / `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Optional draft-only invoice classification automation |
| `list_recent_triager_runs` | `mermail-automate-triage` | Debug before changing a failing triager |

Do not call `set_default_task_triager`. Do not call PayBox write tools from this skill.

## Example: bounded invoice search

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "subject": "invoice",
    "date_start": "2026-08-27T00:00:00.000Z",
    "page": 1,
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean"
  }
}
```

## Example: safe detail read

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

## Example: draft acknowledgment

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "body": "Hello Acme team — we received invoice INV-1042 and it is under review. We will confirm next steps shortly."
  }
}
```

Saving a draft does not authorize `reply_to_email`. Payment language in a draft does not authorize PayBox.
