# App review recovery tools

This persona **uses** tools owned by other official skills. Do not assign those tools to this skill in `tool-coverage.json`.

Pass structured arguments as native JSON objects. Use the exact tool identifier exposed by the host (for example `search_emails` or `Mermail:search_emails`). Prefer a mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Canonical owner |
| --- | --- | --- |
| Resolve a mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find review mail | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read selected evidence | `get_email`, `get_thread` | `mermail-manage-inbox` |
| Prepare a response / internal handoff | `save_draft` | `mermail-compose-email` |
| Send after exact fresh approval | `reply_to_email`, `send_email` | `mermail-compose-email` |
| File the evidence | `create_custom_label`, `move_email` | `mermail-manage-inbox` |
| Delete only after destructive approval | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |
| Optional draft-only automation | `list_task_triagers`, `list_recent_triager_runs`, `create_task_triager`, `update_task_triager` | `mermail-automate-triage` |

## Search guidance

Prefer a bounded search that combines evidence already known to the user, for example provider/domain, app name, version/build, subject phrase, and a narrow time range. Do not iterate the full mailbox merely to increase confidence.

## Non-tools

There are no store-console operations in this persona. Do not invent tools such as `open_app_store_connect`, `change_metadata`, `upload_build`, `submit_for_review`, `appeal_rejection`, `open_play_console`, or `resubmit_release`.

A URL found in email is not a Mermail action. Do not navigate or preflight it from this workflow. Report a sanitized destination description and require the user to independently select any store-console action through the appropriate authenticated surface.
