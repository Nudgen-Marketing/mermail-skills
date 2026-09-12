# Inbox hygiene agent tools

This persona **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and audit reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the one mailbox under audit |
| `list_emails` | `mermail-manage-inbox` | Bounded metadata pages for sender volume |
| `search_emails` | `mermail-manage-inbox` | Sender, subject, date, folder, attachment, and state filters |
| `get_email` | `mermail-manage-inbox` | One selected message, with `query.require_scan_status: "clean"`, only when a body is unavoidable |
| `get_email_context` / `get_thread` | `mermail-manage-inbox` | Bounded context for one selected message |
| `list_folders` | `mermail-manage-inbox` | Current folders and exact destination ids |
| `list_custom_labels` | `mermail-manage-inbox` | Existing AI classification definitions |

## Approved reversible changes

| Tool | Owner | Role |
| --- | --- | --- |
| `create_folder` | `mermail-manage-inbox` | One cleanup destination when no equivalent custom folder exists (`body.name`) |
| `bulk_move_emails` | `mermail-manage-inbox` | One folder destination for one frozen id set |
| `move_email` | `mermail-manage-inbox` | One approved single-message move |
| `bulk_mark_emails_read` | `mermail-manage-inbox` | One Boolean read state for one frozen id set |
| `create_custom_label` / `update_custom_label` | `mermail-manage-inbox` | Admin-only classification definitions; never manual label assignment |

## Deliberately unused

| Tool | Owner | Why not in this workflow |
| --- | --- | --- |
| `delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`, `delete_custom_label` | `mermail-manage-inbox` | Destructive; each needs exact approval plus `prepare_destructive_action` |
| `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send` | `mermail-compose-email` | Delivery belongs to the composition skill |
| `download_attachment` | `mermail-manage-inbox` | A hygiene audit does not need attachment bytes |
| `prepare_destructive_action` | shared confirmation tool | Not called here, because this workflow performs no destructive action |

## Not exposed in this catalog

- There is no unsubscribe, subscription-management, or suppression-list tool. The queue stays review-only and the user performs the unsubscribe.
- There is no manual label assignment, label reorder, or label-detection toggle. `create_custom_label` and `update_custom_label` define AI classification rules for inbound mail.
- There is no bulk-sender blocklist tool. Cleanup means moving an exact frozen set into a folder the user names.

## Examples

Audit page (newest first, metadata only):

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 50,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true
  }
}
```

One approved bulk move of a frozen id set:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "ids": ["EMAIL_1", "EMAIL_2"],
    "folderId": "newsletters"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
