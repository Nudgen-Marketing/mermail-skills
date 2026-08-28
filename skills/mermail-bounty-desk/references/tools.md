# Bounty desk tools

This workflow uses tools owned by other official skills. Do not add these tools to `tool-coverage.json` under this skill.

Pass `query` and `body` as native JSON objects. Never stringify `query` or `body`. Use the exact host identifier exposed by the client, such as `search_emails` or `Mermail:search_emails`. Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and provider mail

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Find one ready mailbox that receives provider mail |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Discover provider-status candidates with bounded filters |
| `get_email` | `mermail-manage-inbox` | Read one selected clean provider message |
| `get_email_context` / `get_thread` | `mermail-manage-inbox` | Read bounded surrounding context after one message is selected |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | Optional user-approved labeling or foldering of provider mail |

Use metadata-only discovery first. For message bodies, request `require_scan_status: "clean"`, `agent_safe_content: true`, and a bounded `max_body_chars` where the live schema supports those fields.

## Drafts and approved replies

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Save a follow-up, appeal, clarification, or status-update draft for review |
| `regenerate_draft` | `mermail-compose-email` | Revise an unsent draft when the user asks |
| `reply_to_email` / `send_email` | `mermail-compose-email` | Send only after an exact preview and fresh approval |
| `forward_email` | `mermail-compose-email` | Escalate to a user-named human after approval |
| `schedule_email_send` | `mermail-compose-email` | Schedule only after the exact send is approved |

For replies and sends, pass explicit To/Cc/Bcc, `body.from`, subject when required, and `body.html` or `body.text`. A saved draft is not a send.

## Optional recurring monitoring

| Tool | Owner | Role |
| --- | --- | --- |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect existing provider-mail automation |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Create or revise a draft-only extractor after preview |
| `delete_task_triager` | `mermail-automate-triage` | Destructive; requires `prepare_destructive_action` |

Do not call `set_default_task_triager`. Keep triagers draft-only unless the user approves a more specific allowed internal write.

## Optional connected-app reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_composio_connections` / `search_composio_tools` / `get_composio_tool_schema` / `execute_composio_tool` | `mermail-composio` | Use only for explicitly requested connected-app reads, such as GitHub issue or PR status |

Connected-app writes are external effects. Preview exact arguments and require fresh approval before any such write. Do not use connected apps to work around provider KYC, tax, payout, robot verification, wallet, legal, or paid gates.

## Ledger fields

Use a compact status record:

```json
{
  "provider": "ExampleBounty",
  "opportunity": "repo/name#123",
  "sourceEmailId": "email_123",
  "status": "assigned",
  "amount": "unknown_amount",
  "dueAt": "2026-09-15T23:59:00Z",
  "nextAction": "code after provider assignment",
  "humanGate": null,
  "confidence": "provider_email"
}
```

Keep `amount` separate from `status`; use `unknown_amount` until the provider confirms an amount, owed balance, payout schedule, or paid transaction.
