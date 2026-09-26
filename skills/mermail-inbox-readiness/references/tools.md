# Inbox readiness tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Headroom and scope

| Tool | Owner | Role |
| --- | --- | --- |
| `list_workspaces` / `get_workspace` | `mermail-administer-workspace` | Resolve one workspace and reuse its stable ID |
| `get_api_credit_usage` / `get_email_usage` | `mermail-administer-workspace` | Headroom read before any provisioning decision |
| `get_workspace_storage` | `mermail-administer-workspace` | Workspace storage baseline for the report |

Read headroom before provisioning. `create_mailbox` costs 10 provision credits.

## Mailbox resolution

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` / `list_workspace_mailboxes` | `mermail-administer-workspace` | Discover a reusable mailbox; multi-mailbox audits |
| `get_mailbox` / `get_mailbox_storage` | `mermail-administer-workspace` | Mailbox state and storage evidence |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits and the exact address is authorized (`email` + `name`) |
| `update_mailbox_settings` | `mermail-administer-workspace` | Only for a setting the user named explicitly |
| `list_email_domains` | `mermail-administer-workspace` | Read-only domain state; never infer verification from the address |

Do not call `add_email_domain`, `verify_email_domain`, `delete_email_domain`, `invite_workspace_member`, `resend_workspace_invite`, `update_member_role`, or `remove_workspace_member` from this workflow. Hand that work to `mermail-administer-workspace`.

## Round-trip probe

| Tool | Owner | Role |
| --- | --- | --- |
| `send_email` | `mermail-compose-email` | The probe; external effect, exact preview, fresh approval, one idempotency key |
| `save_draft` | `mermail-compose-email` | Hold the probe body while the user revises it (`body.body` string) |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Bounded receipt polling with a narrow window and capped retries |
| `get_email` / `get_email_context` | `mermail-manage-inbox` | Inspect the delivered probe and quote its authentication and scan fields |
| `get_thread` | `mermail-manage-inbox` | Only when the probe produced a thread worth reporting |

Send nests fields under `body`. The probe recipient must be a mailbox in this workspace. Do not call `reply_to_email`, `forward_email`, or `schedule_email_send` here.

## Routing surface and monitoring

| Tool | Owner | Role |
| --- | --- | --- |
| `list_folders` / `list_custom_labels` | `mermail-manage-inbox` | Confirm the surface a downstream workflow will address |
| `create_folder` / `create_custom_label` | `mermail-manage-inbox` | Create only the exact name the user asked for |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect before creating anything |
| `create_task_triager` | `mermail-automate-triage` | Classification and draft-only monitoring |

Do not call `set_default_task_triager`; choosing a default task triager is unsupported. Probe-mail deletion (`delete_email`, `bulk_delete_emails`, `empty_trash`) is destructive and stays with `mermail-manage-inbox` under `prepare_destructive_action`.

## Examples

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "idempotencyKey": "readiness-probe-2026-08-26-a1",
  "body": {
    "to": "agent@example.mermail.app",
    "from": "agent@example.mermail.app",
    "subject": "Mermail readiness probe 2026-08-26-a1",
    "text": "Round-trip delivery self-test. No action required."
  }
}
```

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "subject": "Mermail readiness probe 2026-08-26-a1",
    "limit": 10
  }
}
```
