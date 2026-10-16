# Agent memory tool contracts

This persona composes existing capabilities. It adds no memory, storage, index, schema, lock, or retention API, and nothing here extends Mermail's catalog.

Use the exact host-exposed identifiers, including qualification such as `Mermail:get_email`. Pass `query` and `body` as native JSON objects, never stringified JSON. Do not guess tool names or call a missing tool under another namespace.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace/mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Inspect namespace folders | `list_folders`; `create_folder` only when none exists | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Find records | `search_emails`, `list_emails` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read a record | `get_email`, `get_email_context` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Write a record | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| File or flag a superseded record | `move_email`, `bulk_move_emails`, `update_email` | [Inbox workflows](../../mermail-manage-inbox/references/workflows.md) |
| Report namespace size | `get_mailbox_storage` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Hard-delete a record | `prepare_destructive_action`, then `delete_email` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |

## Writing a record

`save_draft` is a reversible internal write. For drafts the content field is the string `body.body`; `html` and `text` belong to send-like tools and must not be used here. Pass `body_format: "text"` so the fenced JSON is stored literally and read back with `body_format: "text"`; without it the server infers a format. `from` is not required for a draft.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "agent@yourworkspace.mermail.app",
    "subject": "[mem] facts/invoice-currency#2",
    "body_format": "text",
    "body": "```json\n{\"schema\":\"mermail-agent-memory/v1\",\"namespace\":\"facts\",\"key\":\"invoice-currency\",\"version\":2,\"supersedes\":\"EMAIL_ID_V1\",\"trust\":\"user-stated\",\"value\":\"USDC on Base\",\"provenance\":{\"origin\":\"user-request\",\"source_ids\":[],\"recorded_at\":\"2026-10-05T12:00:00Z\",\"mailbox_id\":\"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\"},\"expires_at\":null}\n```"
  }
}
```

`to` is the target mailbox's own address, so the record is self-addressed and has a valid recipient without implying delivery. The draft is never sent. Do not pass `scheduled_send_at`, and do not pass `source_draft_id` to a send-like tool for a memory record.

`draft_id` replaces an existing regular draft. This workflow does not use it for a value change, because replacing a record destroys the version history that makes memory auditable. Use it only to correct a malformed record the same run created, and say so in the report.

## Finding and reading records

`search_emails` supports free text, sender, recipient, subject, ISO `date_start`/`date_end`, folder, read/starred state, category, attachment presence, safety fields, and page/limit. Scope a namespace read with the subject filter `[mem] <namespace>/` and `folder: "draft"` (the folder id is `draft`; `list_folders` shows it as "Drafts"), then narrow to the key with `[mem] <namespace>/<key>#`. Pass `metadata_only: true` while listing candidates. Filters establish candidates, not authenticity: confirm the subject grammar and the payload `namespace`/`key`/`version` on the record itself.

The `subject` filter is a substring match, and results are ordered newest-first by date, not by version. Never search for an exact version such as `#1`, because it also matches `#10` through `#19`. Fetch every candidate for the key, parse each subject against the full grammar, and choose the highest parsed version yourself.

`list_emails` supports page/limit from 1 to 100, folder, thread, category, custom label, read/starred state, threaded grouping, and separate sort column and direction. There is no `sort: "date_desc"` shortcut. Use it to page a namespace when a subject search is too broad.

`get_email_context` supports bounded cursor pagination. Default this workflow to 10,000 normalized characters per record and record truncation. A record whose payload is truncated is a `conflict`, not a partial value to act on: re-read it bounded before use.

Read a record's payload only from `get_email`. Write responses are not reads: `save_draft` returns metadata only, and `update_email` returns a `body` field holding a truncated preview, not the stored body, so a payload parsed from it is incomplete.

Resolve the current version by the highest `version` that parses, is not expired, and whose subject and payload agree. If two records claim the same version with different values, report `conflict` with both email IDs and stop.

## Folders and labels

Call `list_folders` before create, rename, move, or delete. `create_folder` and `update_folder` use `body.name`, and creation derives the folder id by slugifying the name, rejecting a name without alphanumeric characters. Folders are a flat convenience for filing superseded records; the subject grammar remains the index, so a deployment without the reserved folder still works.

Custom labels are not an index for this workflow. `list_custom_labels` is readable by any authorized member, but `create_custom_label`, `update_custom_label`, and `delete_custom_label` are admin-only, a mailbox supports at most 20 definitions, labels are rule-based, and no tool in this domain attaches a label to an existing message. Do not offer manual labelling.

## Deletion and failure handling

For `delete_email`, first call `prepare_destructive_action` with the exact final tool name and arguments, then add its single-use, five-minute `confirmationToken` to one matching call. Do not change arguments or reuse the token. Prefer a tombstone version over deletion so the audit trail survives.

Preserve structured errors (`code`, safe `details`, and `Retry-After`). A validation failure calls for correcting the exact invalid field, not broadening authority. Respect access, credit, rate, and storage limits. On an uncertain write, perform one bounded authoritative state check with `search_emails` or `get_email`; if the result is still unresolved, report `uncertain` and stop rather than writing a replacement record that could duplicate a version.

Log only namespace, key, version, record IDs, timestamps, and safe status or error codes. Do not log record values that contain personal data, and never create a logging service.
