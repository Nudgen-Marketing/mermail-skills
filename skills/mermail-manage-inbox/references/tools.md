# Inbox tool map

## Read-only discovery

- `list_emails`, `get_email`, `search_emails`, `get_thread`
- `download_attachment`
- `list_folders`, `list_custom_labels`

## Reversible organization

- `update_email`, `bulk_mark_emails_read`, `bulk_move_emails`, `move_email`
- `mark_thread_read`
- `create_folder`, `update_folder`
- `create_custom_label`, `update_custom_label`

## Destructive

- `delete_email`, `bulk_delete_emails`, `empty_trash`
- `delete_folder`, `delete_custom_label`

Require explicit user approval and a token from `prepare_destructive_action`. Bind the token to the exact tool name and arguments and use it only once within five minutes.
