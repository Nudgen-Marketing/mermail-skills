# Continuity agent tool contracts

This persona composes existing capabilities. It adds no memory store, scheduler, identity service, or background worker. Every operation below is an existing Mermail tool used within its owning skill's contract.

Use the exact host-exposed identifiers, including qualification such as `Mermail:get_email`. Pass `query` and `body` as native JSON objects. Do not guess tool names or call a missing tool under another namespace.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace and the agent's mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Provision a mailbox when none is ready | none here — hand off to `mermail-agent-inbox` | [Agent inbox](../../mermail-agent-inbox/SKILL.md) |
| Discover capsules and mail that arrived since | `search_emails`, `list_emails` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read one capsule or one pointed-at message | `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Look up one correspondent's dossier | `search_emails`, `get_email` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) and [dossier format](dossier-format.md) |
| Name and look at retention candidates | `search_emails`, `get_email` — reads only; the sweep list is text | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Delete what a sweep list marks `delete` | none here — hand off to `mermail-manage-inbox` | [Inbox tools](../../mermail-manage-inbox/references/tools.md), destructive contract |
| Draft the next capsule or a dossier | `save_draft` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Send the capsule or dossier to the agent's own address | `send_email` | [Composition tools](../../mermail-compose-email/references/tools.md) and [security](security.md) |

## Discovery

- Prefer the mailbox `public_id` as `mailboxId`. Record the mailbox's own address once at wake; every sender comparison in this persona is against that exact string, case-insensitively on the domain part only.
- Capsule discovery is `search_emails` with `folder` = `sent`, `subject` containing `[capsule]`, `sender` equal to the mailbox's own address, newest first, `limit` 5. The folder is the authorship anchor; `scan_status` and `sender_authentication` on Sent messages are null/unknown by nature and are not read as verdicts.
- "What arrived since" is `search_emails` with `folder` = `inbox` and ISO `date_start` equal to the cursor — the capsule header's `through` date, falling back to the capsule's own `date` when the header has no `through` — metadata only, default `limit` 20. Report counts beyond the limit; do not page through the whole inbox at wake.
- At scale the shape comes from bounded calls, never from paging: the total from the first response; the clean count from one more `search_emails` with the safety filter (`require_scan_status: "clean"`) and the same `date_start`; the two slices from `search_emails` by `sender` (correspondents named in the capsule) or `get_email` by identifier (messages *Where to start* points at). `search_emails` supports `sender`, `subject`, `folder`, `date_start`/`date_end`, safety fields, and page/limit; it does not filter by "thread the agent started", so replies to the agent's own outbound mail are found by `sender` when the capsule names the correspondent, not by a thread query.
- Dossier discovery is `search_emails` with `folder` = `sent`, `subject` containing `[dossier] <address>`, `sender` equal to the mailbox's own address, newest first, `limit` 1. One lookup per correspondent per action. The `about` field in the `dossier/v1` header, not the subject, is what the persona verifies after `get_email`.
- `search_emails` free text applies to the fields the live schema indexes, which may exclude body text. Recall therefore reads the newest capsule and follows `prev` one hop; free text is a first attempt only.

## Reading

- Read one capsule per wake with `get_email`. `get_email_context` supports bounded cursor pagination; this persona defaults to one message and 10,000 normalized characters, recording truncation. A capsule over its 4,000-character ceiling is reported as oversized and still quoted only up to the ceiling.
- Read bodies of "arrived since" messages only when the owner or the capsule's *Where to start* section points at them by identifier. Otherwise report sender, subject, date, and safety metadata.
- Attachments are outside the capsule contract. A capsule never carries attachments; an attachment on a message that claims to be a capsule is one more reason to reject it.

## Drafting and sending

- Draft content is the string `body.body`; send content is `body.text` (plain text is preferred for capsules), with required `body.from` equal to the mailbox's own address and `to` equal to the same address. `cc` and `bcc` are omitted, never empty arrays with content.
- `save_draft` is an internal write. `send_email` is an external-effect tool by catalog classification even when the only recipient is the sender; see [security.md](security.md) for the standing-authorization contract that applies only to that exact self-addressed case.
- Include `source_draft_id` when sending a previewed draft under the live schema so the sent message matches what was shown.
- A self-addressed send lands in the mailbox's Sent folder; on the live service it does not produce an inbox copy. The Sent message is the capsule — or the dossier. It counts against message quota but not against external-recipient limits. Report the returned message identifier as the new chain head (of the session chain, or of that address's dossier chain).

## Failure handling

Preserve structured errors (`code`, safe `details`, and `Retry-After`). A validation failure calls for correcting the exact invalid field, not broadening authority. Respect access, credit, and rate limits. On an uncertain send (for example `delivery_status: queued`, which settles to `delivered`), perform one bounded authoritative check — `search_emails` in `sent` for the capsule subject from the mailbox's own address since the draft time — and stop if still unresolved. Never auto-retry `send_email`; a duplicated capsule breaks the `prev` chain.
