# Mermail tool mapping

Every mailroom effect goes through an existing Mermail MCP tool. This skill adds
no server surface; it only sequences calls and keeps local state.

| mailroom step | Mermail tool | notes |
|---|---|---|
| resolve mailbox | `list_mailboxes`, `get_mailbox` | prefer `public_id`; reject disabled/non-receiving boxes |
| find journal thread | `list_emails`, `get_thread` | filter subject prefix `[mailroom][topic:<t>]`, page before declaring absence |
| post assign/claim/result/note | compose + send path from `mermail-compose-email` | set `body.threadId` when continuing a journal |
| poll new mail | `list_emails` with cursor bounds | read-only, safe to retry |
| fetch one message | `get_email`, `get_email_context` | parse envelope after sender check |
| mark handled | `bulk_mark_emails_read` | only after successful classification |
| move out of inbox | `move_email` | optional; never delete failed-verification mail |

Deliberately unused: every `paybox_*` tool, `prepare_destructive_action`,
`bulk_delete_emails`, `empty_trash`, and all Composio tools. Coordination traffic
has no reason to touch destructive or financial surface area.

## Auth model

`MERMAIL_API_KEY` authenticates the *mailbox*, not the actor. Two agents holding
the same key are indistinguishable to Mermail. Consequences:

- Sender verification is local (allowlist file), and is integrity, not secrecy.
- Rotation must happen at the mailbox level; the mailroom does not store keys.
- If true per-actor authentication is required, give each actor its own mailbox
  and keep the journal replicated into the shared box instead of reading it in
  place. Document that trade-off rather than pretending the single-box variant
  authenticates anyone.
