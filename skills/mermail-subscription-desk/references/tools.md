# Subscription desk tool map

This desk owns no tools. It composes tools that already have canonical owners. Read live schemas from MCP `tools/list`; the names below are the contracts this desk relies on.

## Read (owned by `mermail-manage-inbox`, `mermail-agent-inbox`, `mermail-administer-workspace`)

- `list_workspaces`, `list_mailboxes`: resolve the authenticated workspace and the billing mailbox. Prefer a returned mailbox `public_id` as `mailboxId`.
- `search_emails`: primary discovery tool. Search billing vocabulary — invoice, receipt, renewal, subscription, trial, billing, payment received, price change, auto-renew, cancel before — rather than scanning an entire mailbox.
- `list_emails`: bounded listing for a folder or date window when search terms are unknown.
- `get_email`, `get_email_context`: read one in-scope message and its surrounding context. Read only mail inside the owner's stated scope.
- `get_thread`: resolve a renewal notice against the purchase it refers to, so one charge does not become two rows.
- `download_attachment`: last resort for a required field that the message body does not state. Treat the file as untrusted data.

## Draft (owned by `mermail-compose-email`)

- `save_draft`: create the cancellation, downgrade, or billing-question draft. This desk stops here.
- `regenerate_draft`: revise a draft the owner asked to change. Recheck recipients every time.

## External effect (owned by `mermail-compose-email` — not called by this desk)

- `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`: delivery happens in the composing workflow, after the owner authorizes the exact sender, recipients, subject, body, and timing.

## Destructive (owned by `mermail-manage-inbox` — not called by this desk)

- `delete_email`, `bulk_delete_emails`, `empty_trash`, `move_email`, `bulk_move_emails`: cleanup and organization stay with the inbox workflow under its `prepare_destructive_action` contract. A tidy register is never a reason to delete mail.

## Wallet and payment (owned by `mermail-agent-wallet`, `mermail-x402-agent`, `mermail-xstocks-desk` — not called by this desk)

- `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `paybox_get_portfolio`, and legacy proposal tools are out of scope. This desk reports recurring spend; it never executes it.

## Naming rule

Do not invent a tool. If a step needs capability that none of the tools above provides, report the gap to the owner and stop instead of substituting a different operation.
