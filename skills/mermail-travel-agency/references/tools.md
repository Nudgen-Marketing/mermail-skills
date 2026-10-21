# Travel agency tool contracts

This persona uses tools owned by other official skills. Do not assign these tools to `mermail-travel-agency` in `tool-coverage.json`.

Use the exact identifier exposed by the host, including a host-qualified form when present. Pass `query` and `body` as native JSON objects. Prefer mailbox `public_id` as `mailboxId`.

| Operation | Existing tools | Canonical owner |
| --- | --- | --- |
| Resolve workspace and mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` |
| Select and read inquiry | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Read one selected catalog attachment | `download_attachment` | `mermail-manage-inbox` |
| Save clarification or proposal | `save_draft` | `mermail-compose-email` |
| Deliver an approved proposal | `reply_to_email` | `mermail-compose-email` |

There are no Mermail tools for travel search, inventory, booking, ticketing, payment, refund, customer profiles, or catalog storage. Do not invent them. Public destination research may use a host-provided browsing capability outside Mermail, but it is optional and cannot establish agency price, availability, or commercial terms.

## Read bounds

- Start metadata-only. Read at most eight relevant thread messages and 10,000 normalized characters per message unless the user expands the scope.
- Require `scan_status: clean` before interpreting a body or attachment. Keep flagged, failed, pending, or unknown content metadata-only.
- Before `download_attachment`, verify workspace, mailbox, email, attachment identifier, MIME type, size, and scan context. The current binary response limit still applies.
- Use one selected catalog revision. Do not combine conflicting versions without advisor direction.

## Draft and reply contracts

- `save_draft` uses `body.body` for draft content. Preserve thread metadata when the live schema supports it.
- `reply_to_email` targets the exact source `emailId`; MCP does not infer Reply All. Include explicit `to`, `cc`, `bcc`, `from`, and `text` and/or `html` according to the live schema.
- When sending a reviewed draft, include its source draft identifier when the live schema provides that field.
- A reply is an external effect. Freeze and preview sender, recipients, subject/body, proposal version, catalog revision, totals, and validity before authorization.
- On timeout or ambiguous acceptance, inspect the original thread once. Do not issue another reply or change the payload/idempotency value to force success.

## Failure handling

Preserve structured errors and retry timing. Correct validation fields without widening scope. Respect workspace access, plan, credit, rate, and external-recipient limits. Never split recipients or switch delivery surfaces to evade a limit.
