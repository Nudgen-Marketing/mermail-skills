# Security sentinel tool contract

This skill owns no MCP tools. It composes tools owned by `mermail-administer-workspace`, `mermail-manage-inbox`, `mermail-compose-email`, and `mermail-automate-triage`. Use the exact tool identifier exposed by the current host (Claude may show `Mermail:search_emails`; at the protocol boundary the name is bare). Pass `query` and `body` as native JSON objects, never stringified.

## Tools used, by phase

| Phase | Tools | Owner |
| --- | --- | --- |
| Mailbox resolution | `list_mailboxes` | mermail-administer-workspace |
| Registry build and event reads | `search_emails`, `list_emails`, `get_email`, `get_thread` | mermail-manage-inbox |
| Classifier definitions | `list_custom_labels`, `create_custom_label`, `update_custom_label` | mermail-manage-inbox |
| Registry persistence and alert drafts | `save_draft` | mermail-compose-email |
| Approved owner alert | `send_email`, `forward_email` | mermail-compose-email |
| Between-session classification | `list_task_triagers`, `create_task_triager`, `update_task_triager`, `list_recent_triager_runs` | mermail-automate-triage |

Not used, ever, from this workflow: `delete_email` and other destructive tools, `reply_to_email` (never answer security mail), `download_attachment`, `set_default_task_triager`, any `paybox_*` or Agent Wallet tool, any Gmail/Outlook Composio tool.

## Argument notes

Registry-build search, metadata first and bounded:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "search": "verify your email",
    "date_start": "2026-05-01T00:00:00Z",
    "date_end": "2026-08-01T00:00:00Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 25
  }
}
```

Run separate narrow passes for common shapes ("verify", "welcome to", "confirm your", "your account") rather than one broad scan. Search filters establish candidates only; they are not sender authentication.

Read one selected event:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID"
}
```

Require `scan_status: clean` before interpreting the body. `sender_authentication.status` must be `pass` to call a sender verified; `unknown` is not `pass`.

Registry draft (`save_draft`): `body.from` is the monitored mailbox address, `body.to` is empty or the mailbox itself, `body.subject` is `Sentinel Registry`, and `body.body` is a plain-text table of `service | expected domains | first seen | evidence message ids`. Pass the existing draft id to update in place instead of accumulating copies. A draft never sends.

Classifier definition (`create_custom_label`): name plus a description of what the classifier should match, for example security-event shapes (password reset, new sign-in, two-factor change, lockout, breach notification). This defines a rule; manual assignment of a label to an existing email is not exposed - do not attempt it.

Owner alert (`send_email`): explicit `to` from user-supplied owner address, `body.from` = monitored mailbox, `body.text` and/or `body.html`. Preview exact recipients and body before the approved single send.

Triager (`create_task_triager`): instructions must be classify-and-draft only. A triager may label and draft an alert; delivery always returns to a human-approved send.

## Plan and credit caveats

- Reads and searches consume workspace API credits; keep registry rebuilds incremental (search since the last registry update, not from scratch).
- MCP attachment reads are limited to small files; this workflow never needs attachments.
- The full tool surface above is available on an API-key connection; no OAuth-only tool is required.
