# Subscription sentinel tool map

This skill orchestrates tools owned by other Mermail domain skills. It owns none of them. Resolve the workspace and mailbox once with `list_mailboxes` and reuse returned stable IDs; prefer mailbox `public_id` as `mailboxId`.

## Intent to real tool

| Requested intent | Real Mermail tool | Owning skill |
| --- | --- | --- |
| Find candidate receipt/renewal mail | `search_emails` with native JSON `query` objects | `mermail-manage-inbox` |
| Read one receipt or invoice | `get_email` | `mermail-manage-inbox` |
| Read thread history for price-hike evidence | `get_thread`, `get_email_context` | `mermail-manage-inbox` |
| Draft a cancellation or unsubscribe request | `save_draft` | `mermail-compose-email` |
| Rework a drafted cancellation | `regenerate_draft` | `mermail-compose-email` |
| Deliver an approved cancellation | `send_email` or `reply_to_email` (external effect; exact preview plus fresh approval) | `mermail-compose-email` |
| Schedule an approved cancellation (explicitly requested) | `schedule_email_send` (external effect) | `mermail-compose-email` |
| Organize subscription mail on request | `list_custom_labels`, `create_custom_label`, `list_folders`, `create_folder`, `move_email` | `mermail-manage-inbox` |
| Draft-only classification automation on request | `list_task_triagers`, `create_task_triager`, `update_task_triager`, `list_recent_triager_runs` | `mermail-automate-triage` |
| Delete subscription mail (explicit destructive approval) | `delete_email` plus `prepare_destructive_action` | `mermail-manage-inbox` |

## Absent tools

There is no `unsubscribe`, `cancel_subscription`, `refund_charge`, `block_card`, or any payment tool reachable from this workflow. Map the words "unsubscribe", "cancel", and "refund" to the real rows above — normally one drafted or approved email to the merchant — and say plainly what Mermail cannot do by itself.
