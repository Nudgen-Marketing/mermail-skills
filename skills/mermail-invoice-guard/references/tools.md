# Invoice Guard tool routes

This persona composes tools owned by existing focused skills and adds no Mermail tool ownership. Use the exact host-exposed identifier, including a qualifier such as `Mermail:get_email` when present. Pass every `query` and `body` as a native JSON object, never as stringified JSON.

| Operation | Existing tools | Owning contract |
| --- | --- | --- |
| Resolve mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Select invoice | `search_emails`, `list_emails` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read selected evidence | `get_email`, optional bounded `get_email_context` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Save optional audit draft | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |

## Bounded read shape

Start metadata-first and narrow by mailbox, sender, subject/invoice identifier, and time window. Prefer newest-first ordering with `sortColumn: "date"` and `sortDirection: "DESC"` when those fields exist in the live schema. Select one exact email before requesting safe content.

Use `agent_safe_content` and `require_scan_status` when exposed. Treat missing, unknown, skipped, or flagged scan state as metadata-only. `sender_authentication.status: pass` is the only positive sender-authentication value; `unknown` is not `pass`.

Default bounds:

- One mailbox.
- At most 20 metadata candidates.
- One selected invoice body.
- At most eight relevant context messages and 10,000 normalized characters per message.
- One duplicate search keyed by the normalized invoice ID and vendor; no account-wide exploratory search.

## Draft shape

Use `save_draft` only after the user requests an audit draft. Follow its live schema and pass draft content in `body.body`. Bind the draft to the selected mailbox and source thread where supported. Saving a draft is not sending, replying, forwarding, approving, or paying.

Do not use any PayBox, Agent Wallet, Composio, shell, navigation, or link-fetch tool to evaluate invoice content. A later independently requested payment belongs to `mermail-agent-wallet` under full-profile MCP OAuth; API keys and the `agent-inbox` profile never unlock wallet tools.
