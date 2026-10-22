# Security agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `scan_threat`, `block_sender`, `report_phishing`, or reputation tools. Screening composes existing reads, labels, folder moves, and drafts. Do not invent the missing ones.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover the target mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` |
| Budget the run | `get_api_credit_usage`, `get_email_usage` | `mermail-administer-workspace` |
| Discovery pass (metadata only) | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Open one message or its thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Inspect existing labels and folders before creating | `list_custom_labels`, `list_folders` | `mermail-manage-inbox` |
| Create the containment label or folder once | `create_custom_label`, `create_folder` | `mermail-manage-inbox` |
| Contain a message | `move_email` (`bulk_move_emails` for one approved batch) | `mermail-manage-inbox` |
| Mark state after review | `update_email`, `mark_thread_read` | `mermail-manage-inbox` |
| Report to the owner without sending | `save_draft` | `mermail-compose-email` |
| Escalate to an owner-supplied address (approval) | `forward_email` | `mermail-compose-email` |
| Continuous screening (draft-only) | `list_task_triagers`, `create_task_triager`, `update_task_triager`, `list_recent_triager_runs` | `mermail-automate-triage` |
| Delete quarantined mail (rare, approved) | `delete_email`, `bulk_delete_emails`, `empty_trash` + `prepare_destructive_action` | `mermail-manage-inbox` |

## Read controls

`get_email` exposes the safe-read controls this skill depends on: `metadata_only`, `action_metadata_only`, `agent_safe_content`, `include_held`, and `require_scan_status`. `list_emails` and `search_emails` accept `query.limit` (1–100) and `query.metadata_only`.

Prefer mailbox `public_id` as `mailboxId`. Do not set `set_default_task_triager`; it is unsupported by the curated workflow.

## Live behaviour worth knowing

Verified against a live workspace on 2026-09-15:

- **Label association does not hold.** `create_custom_label` returns an id, but attaching it with `update_email`, `move_email`, or `bulk_move_emails` returns success while `custom_labels` stays `[]` on re-read, and label-filtered queries return nothing. Make the folder move your containment and mention labels as advisory.
- **The provider verdict can be missing.** `sender_authentication` may come back as `{"status": "unknown", "spf": "unknown", "dkim": "unknown", "dmarc": "unknown", "reason": "provider_sender_authentication_verdict_unavailable"}`. The real verdict is then only visible in `raw_headers` (`authentication-results`, `received-spf`). Quote it as evidence; it is not a `pass` signal.
- **`scan_status` / `scan_threats`** are present per message (`"clean"` with an empty `scan_threats` list is the ordinary case).
- **`provider_metadata.aiDraftStatus`** can carry `{"status": "suspicious", "reason": "safety_review_required"}` when the platform withheld its own draft. Corroborating signal, never a verdict on its own.
- **`get_api_credit_usage` and `get_email_usage` require `workspaceId`** (pass `query.workspaceId` or the argument directly); without it the call fails input validation.
- **Batch reads get rate limited.** Expect 429s on a 25-message batch; back off and repeat rather than dropping messages.

## Examples

Discovery pass, then one bounded body read:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": { "limit": 25, "metadata_only": true, "folder": "inbox" }
}
```

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "query": { "require_scan_status": "clean" }
}
```

Containment happens in two steps, label first, move second:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": { "name": "Security/Quarantine", "color": "#B91C1C" }
}
```

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "body": { "folderId": "fld_quarantine" }
}
```
