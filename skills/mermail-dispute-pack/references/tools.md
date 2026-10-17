# Tools used by mermail-dispute-pack

This skill owns **no tools of its own**. It is a cross-domain workflow that
composes bounded reads from the inbox domain and hands escalation to the
compose domain. Use the exact tool identifier the host exposes — for example
`Mermail:list_emails` — and do not manually add, strip, or invent the
host-qualified prefix.

## Read tools this skill composes

| Tool | Purpose in a dispute pack |
| --- | --- |
| `list_mailboxes` | Resolve the mailbox. Prefer the mailbox `public_id` as `mailboxId`. |
| `search_emails` | Bounded search by counterparty domain, order id, receipt id, or amount. |
| `get_email` | Read one exact message when only the body text is needed. |
| `get_email_context` | Read the oldest-first thread page around one message. |

These four are owned by `mermail-manage-inbox`; read that skill for the full
argument shape. The rules that matter most here:

- Pass `query` and `body` as **native JSON objects**. Never send a stringified
  JSON blob, and never `JSON.stringify` a query object.
- There is no `sort: "date_desc"` shortcut. Sort with
  `"query": { "sortColumn": "date", "sortDirection": "DESC" }`.
- Sort **ascending** when building a timeline; a dispute pack is read
  chronologically.
- Use `metadata_only` when screening candidate messages, then read the bodies of
  only the messages the claim needs.
- `require_scan_status` and `agent_safe_content` gate what may be read. Unknown
  is not pass.

## Bounded read budget

A pack should need on the order of ten to thirty `search_emails`/`get_email`
calls, not hundreds. If the search is returning the whole mailbox, the claim is
not scoped — go back to step 1 rather than widening the read.

Do not loop reads over an unbounded result set. Page with the opaque
`next_cursor` and stop as soon as the claim is evidenced or shown to be
unsupported.

## Tools this skill must not call

| Tool | Why |
| --- | --- |
| `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send` | External effects. Hand the pack to `mermail-compose-email` instead. |
| `delete_email`, `move_email`, `update_email`, `empty_trash` | This skill is read-only; a pack is never a reason to mutate mail. |
| `prepare_destructive_action` | It is only for a destructive call this skill must not make. |
| `paybox_*`, wallet tools | A dispute is resolved by evidence, not by moving funds. |

If the operator wants the claim delivered, produce the pack and then route to
`mermail-compose-email`, which runs its own exact preview and approval for the
external effect.

## Evidence fields worth capturing

When reading a message for the pack, capture:

- the short message id, as exposed by the host
- the received date
- the envelope sender address, not just the display name
- `sender_authentication` — `pass` is an authentication signal; `unknown` is not
- the verbatim excerpt that carries the amount, date, identifier, or promise

Anything not captured this way cannot be cited, and a fact that cannot be cited
does not belong in the pack.

