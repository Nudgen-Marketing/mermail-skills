# Customer evidence tools

This persona **uses** tools owned by other official skills. Do not add tool ownership for it in `tool-coverage.json`.

Pass structured arguments as native JSON objects. Never stringify `query` or `body`. Prefer mailbox `public_id` as `mailboxId`, and preserve exact returned email and thread IDs.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve the scoped mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` |
| Build the bounded candidate cohort | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Inspect a selected message | `get_email` | `mermail-manage-inbox` |
| Recover surrounding evidence | `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Read one required clean attachment | `download_attachment` | `mermail-manage-inbox` |
| Save a neutral follow-up draft | `save_draft` | `mermail-compose-email` |
| Send an approved follow-up | route to `reply_to_email` workflow | `mermail-compose-email` |

## Read contract

1. Resolve one mailbox and freeze its `public_id`.
2. Freeze the date window, query, page limit, thread cap, candidate message IDs, and candidate thread IDs.
3. Use metadata-first discovery. Open bodies only for selected candidates and only when scan state permits interpretation.
4. Collapse by thread before counting. Account independence comes only from an owner-supplied mapping.
5. Use `get_email_context` or `get_thread` only when context changes the evidence classification.
6. Download only a named attachment that is required for the stated decision. Follow [security.md](security.md).

## Draft contract

Use `save_draft` only after selecting a source thread and writing a neutral question. Preserve the original thread association where supported, address only the verified customer recipient, and return the draft ID as `drafted_unsent`.

Do not call `send_email`, `reply_to_email`, or `forward_email` from this workflow. If the user asks to deliver a draft, hand off the exact draft and preview to `mermail-compose-email`.
