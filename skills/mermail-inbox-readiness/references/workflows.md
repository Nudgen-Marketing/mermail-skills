# Inbox readiness workflows

Four sequences. Stop at the first one that cannot complete and report why.

## 1. Headroom before provisioning

1. `list_workspaces`, then `get_workspace` for the selected workspace.
2. `get_api_credit_usage`, `get_email_usage`, `get_workspace_storage`.
3. Report the returned numbers. State the `create_mailbox` cost as 10 provision credits.
4. If credits cannot cover a provision, stop before provisioning and offer reuse instead.

## 2. Resolve or provision one mailbox

1. `list_mailboxes` (add `list_workspace_mailboxes` for a multi-mailbox audit).
2. Prefer a ready mailbox and use its `public_id` as `mailboxId`. Skip mailboxes reserved for an active third-party verification flow; those belong to `mermail-agent-inbox`.
3. `get_mailbox` and `get_mailbox_storage` for evidence.
4. `list_email_domains` for the sending domain. Report verified only when the tool says verified.
5. Provision only when nothing fits: preview the exact `email` and `name`, get authorization, call `create_mailbox` once. Do not loop through write retries.

## 3. Round-trip delivery self-test

1. Compose a probe whose recipient is a mailbox in this workspace, normally the mailbox itself.
2. Use a unique, human-readable subject, for example `Mermail readiness probe <date>-<suffix>`, and a body that states it is a self-test.
3. Preview exact `from`, `to`, subject, and body. Wait for fresh approval. `save_draft` while the body is still being revised.
4. `send_email` once with `body.from` = mailbox email, explicit `to`, `body.text` and/or `body.html`, and one idempotency key.
5. Poll `search_emails` (or `list_emails`) against the probe subject in a narrow window with capped retries. State the cap before starting.
6. On arrival, `get_email` and quote `sender_authentication.status` and `scan_status` verbatim.
7. On no arrival within the cap, report `probe_missing` and `degraded`. Do not extend the wait and do not send a second probe without a new approval.

## 4. Routing surface and optional monitoring

1. `list_folders` and `list_custom_labels` for the surface a downstream workflow will address.
2. `create_folder` / `create_custom_label` only for an exact name the user asked for.
3. `list_task_triagers` and `list_recent_triager_runs` before creating anything.
4. `create_task_triager` limited to classification and draft-only output. Do not call `set_default_task_triager`.
5. Hand the mailbox to the named next skill: `mermail-agent-inbox`, `mermail-manage-inbox`, `mermail-support-agent`, `mermail-gtm-agent`, or `mermail-scheduling-agent`.

## Verdict table

| Verdict | Meaning |
| --- | --- |
| `ready` | Mailbox resolved, domain state read, probe received, `sender_authentication.status` `pass`, `scan_status` `clean` |
| `degraded` | Delivered but a check returned `unknown`, or the probe was skipped or not authorized |
| `blocked` | Connection, headroom, authorization, or delivery failed; name the failed check |
