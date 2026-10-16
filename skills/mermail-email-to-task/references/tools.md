# MCP tools used by mermail-email-to-task

All tools are served by the Mermail MCP server at
`https://console.mermail.app/mcp` (transport: `streamable_http`).
Authentication: `MERMAIL_API_KEY` env var.

## list_mailboxes

Lists the mailboxes in the workspace. Call first when the mailbox id is
unknown. Returns mailbox ids, addresses, and names.

## list_emails

Lists emails in a mailbox. Parameters: `mailbox_id` (required), `limit`
(default 25). Returns subject, sender, snippet, date, and read state per
email. Use for the initial sweep.

## search_emails

Keyword search across the mailbox. Parameters: `mailbox_id`, `query`.
Use when the user wants a focused scan ("find all invoices", "emails about
the launch").

## get_email

Fetches the full body of one email. Parameters: `mailbox_id`, `email_id`.
Call for every candidate that looks actionable from its snippet — never
classify on the snippet alone.

## get_email_context

Fetches the surrounding thread for an email. Parameters: `mailbox_id`,
`email_id`, `limit`. Use for long threads where the latest message alone is
ambiguous about what action is needed.

## Tools deliberately NOT used

Compose (`send_email`, `reply_to_email`, `forward_email`, `save_draft`,
`schedule_email_send`), organization (`update_email`, `move_email`,
`bulk_mark_emails_read`), deletion (`delete_email`, `bulk_delete_emails`,
`empty_trash`), and `prepare_destructive_action` are out of scope. See
`security.md`.
