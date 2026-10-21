# Tools — Mermail Perishable Verdict

This skill **owns no MCP tools**. It composes read tools owned by other skills
and adds no tool of its own to `tool-coverage.json`. Ownership, argument
contracts, and error handling stay with the owning skill.

Use the exact identifier the host exposes. Some hosts qualify names
(`Mermail:list_emails`); do not strip or invent qualification.

| Tool | Owned by | Used here for |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve exactly one mailbox; prefer `public_id` as `mailboxId` |
| `search_emails` | `mermail-manage-inbox` | Narrow sender/recipient/subject/time window search for candidate evidence |
| `list_emails` | `mermail-manage-inbox` | Bounded listing when a window is known but no search term is |
| `get_email` | `mermail-manage-inbox` | Read one unambiguous candidate, under the frozen call cap |
| `get_email_context` | `mermail-manage-inbox` | Bounded sanitized thread page when surrounding messages are material |
| `save_draft` | `mermail-compose-email` | Unsent clarification request when evidence is missing |
| `reply_to_email` | `mermail-compose-email` | Only after an exact preview and fresh approval |

## Argument shapes

- `query` must be a **native JSON object**. Never pass a stringified JSON blob.
- Prefer mailbox `public_id` as `mailboxId`.
- Follow `next_cursor` only while a frozen condition is unresolved, and stop at
  the frozen call cap.

## Plan and credit caveats

- Sold API calls debit workspace API credits on every plan, Free included. Keep
  runs bounded — a decision that costs more credits than the decision is worth
  has failed even when the verdict is correct.
- Free workspaces are limited to 10 API RPM. Space bounded reads accordingly
  rather than retrying into the limit.
- Agent Wallet tools are **not** available on an `MERMAIL_API_KEY` session; they
  require full-profile OAuth. This skill never calls them and never claims an
  API key can.

## Observation timestamps

`observed_at` is the time of the read that produced the item, recorded by this
skill at call time. No Mermail tool returns it. Never substitute a message's
`Date` header, its `created_at`, or the thread's last-activity time.
