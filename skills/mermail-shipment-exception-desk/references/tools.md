# Shipment exception tools

This persona uses tools owned by existing Mermail skills. Do not add duplicate ownership under `domains` in `tool-coverage.json`.

Pass structured arguments as native JSON objects. Use the exact identifier exposed by the host, including a host-qualified form such as `Mermail:search_emails` when that is what the client reports. Prefer mailbox `public_id` as `mailboxId`.

| Purpose | Tools | Owner | Risk |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` | read |
| Find case | `search_emails`, `list_emails` | `mermail-manage-inbox` | read |
| Read bounded evidence | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` | read |
| Save next-step draft | `save_draft` | `mermail-compose-email` | reversible internal write |
| Contact or escalate | `reply_to_email`, `forward_email`, `send_email` | `mermail-compose-email` | external effect; exact preview and approval |
| Update internal state | `list_custom_labels`, `create_custom_label`, `list_folders`, `move_email` | `mermail-manage-inbox` | reversible internal write after preview |
| Inspect draft-only automation | `list_task_triagers`, `list_recent_triager_runs` | `mermail-automate-triage` | read |

There is no carrier-tracking, shipment, refund, claim, or delivery-verification MCP tool. Do not invent one or claim that inbox data is carrier API verification. Never use `delete_email` or a PayBox tool in this workflow.

## Bounded search pattern

Use one mailbox and a narrow window around a user-supplied order ID, tracking reference, carrier, recipient, or selected message. Start metadata-only, require one case match, and then read at most eight relevant messages. If two orders reuse the same tracking-like text or the order binding is ambiguous, stop and ask with non-sensitive metadata.

`query` arguments remain native objects. Do not send a JSON-encoded string in a `query` field.
