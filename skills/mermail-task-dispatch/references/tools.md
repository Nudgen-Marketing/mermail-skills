# Task dispatch tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and intake reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the one ready dispatch mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits and the user authorizes it (10 credits; `email` + `name` required) |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded sweep for task-card tags in a stated time window; `search_emails` supports `require_scan_status: "clean"`. Use `list_emails` with the `folder` parameter (for example `folder: sent`) to read the sent folder when confirming a delivered `delivery_status` |
| `get_email` / `get_thread` | `mermail-manage-inbox` | Read one tagged message or a mixed-tag thread; require `scan_status: clean` before body use |

## Organization (optional, only when the user asks)

| Tool | Owner | Role |
| --- | --- | --- |
| `list_folders` / `create_folder` | `mermail-manage-inbox` | Status folders such as `Tasks/Open`, `Tasks/Blocked`, `Tasks/Done` |
| `move_email` | `mermail-manage-inbox` | Mirror a reconciled task state into its folder |

## Composition (draft-first, approval-gated)

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Task card, clarification, or nudge draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Approved dispatch only (`body.from` = mailbox email, explicit `to`/`cc`/`bcc`, `body.html` and/or `body.text`, one idempotency key per approved send) |
| `reply_to_email` | `mermail-compose-email` | Approved in-thread follow-up only |

Send and reply nest Sold fields under `body`. MCP does not auto-fill Reply All.

## Examples

Draft a task card (approval-gated, never sent directly):

```json
{
  "tool": "Mermail:save_draft",
  "arguments": {
    "mailboxId": "<dispatch-mailbox public_id>",
    "body": {
      "to": ["worker@example.com"],
      "subject": "[TASK TASK-20261002-02] One-page research brief",
      "body": {
        "text": "Assignee: research-agent (worker@example.com)\nDeliverable: one-page brief on the three papers\nInputs: paper links from TASK-20261002-01\nAcceptance: brief file path in the RESULT reply\nDeadline: 2026-10-03T18:00:00+08:00\nReply-With: [ACK TASK-20261002-02] on receipt, [RESULT TASK-20261002-02] when done, [BLOCKED TASK-20261002-02] if stuck"
      }
    }
  }
}
```

Send the approved card, retiring the draft (`source_draft_id` from the `save_draft` result):

```json
{
  "tool": "Mermail:send_email",
  "arguments": {
    "mailboxId": "<dispatch-mailbox public_id>",
    "source_draft_id": "<save_draft result id>",
    "idempotency_key": "<one key per approved send>",
    "body": {
      "from": "<dispatch-mailbox email>",
      "to": ["worker@example.com"],
      "subject": "[TASK TASK-20261002-02] One-page research brief",
      "body": {
        "text": "<exact body approved by the user>"
      }
    }
  }
}
```

## Explicitly out of scope

- `create_task_triager` / `update_task_triager` / `delete_task_triager` and `set_default_task_triager` belong to `mermail-automate-triage`. This workflow never calls them; a draft-only triager may pre-classify tags, but configuration requests route to that skill.
- No PayBox / Agent Wallet tools. Task mail can never trigger a payment.
- No destructive tools are used by this workflow.
