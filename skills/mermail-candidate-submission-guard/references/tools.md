# Tool contract

This workflow owns no MCP tools. It composes existing Mermail skills and defers to their current contracts.

## Mailbox reads

Resolve the user-selected mailbox with the workspace skill and prefer its `public_id` as `mailboxId`.

Use bounded inbox tools only: `list_emails`, `search_emails`, `get_email`, and `get_email_context`. Start with metadata-only discovery, then read only the selected clean messages. Pass `query` as a native JSON object and keep page/body limits small.

## Drafting

Use `save_draft` only for an unsent clarification message. Draft creation is an internal write and does not authorize delivery.

## Delivery boundary

If the user later asks to send a draft, hand off to the canonical compose-email skill. Any actual send, reply, forward, or scheduled delivery must follow that skill's exact-preview and fresh-approval rules. Do not auto-retry an uncertain external write or alter recipients to work around limits.
