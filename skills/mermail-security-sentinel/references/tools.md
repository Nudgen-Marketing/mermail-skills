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
    "subject": "verify",
    "date_start": "2026-05-01T00:00:00Z",
    "date_end": "2026-08-01T00:00:00Z",
    "metadata_only": true,
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "page": 1,
    "limit": 25
  }
}
```

The free-text field is `query.query`; `query.subject`, `query.from`, and `query.to` are the narrower filters. There is no `search` key. Run separate narrow passes for common shapes ("verify", "confirm", "welcome") rather than one broad scan. Search filters establish candidates only; they are not sender authentication.

Read one selected event:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID"
}
```

Require `scan_status: clean` before interpreting the body. Passing `query.require_scan_status: "clean"` is the safe form: on a mismatch the tool returns safe metadata with `content_omitted: true` and `content_omission_reason: "scan_status_not_clean"` rather than a not-found error, so a non-clean message is still reportable without ever exposing its body.

`sender_authentication.status` must be `pass` to call a sender verified; `unknown` is not `pass`. Expect `unknown` to be the normal case, not an edge case: on a mailbox with `inbound_provider: cloudflare_routing` every inbound message observed carried `status: unknown` with `reason: provider_sender_authentication_verdict_unavailable`. A sentinel that treats `unknown` as failure alerts on everything, and one that treats it as success authenticates nothing. Report it as its own state and let the domain comparison carry the verdict.

Registry draft (`save_draft`): `body.from` is the monitored mailbox address, `body.to` is empty or the mailbox itself, `body.subject` is `Sentinel Registry`, and `body.body` is a plain-text table of `service | expected domains | first seen | evidence message ids`. Pass the existing draft id to update in place instead of accumulating copies. A draft never sends.

Classifier definition (`create_custom_label`): `body` is `{ "name": "Security event", "rules": "..." }`. `rules` is required and is the natural-language matching rule; there is no `description` field, and omitting `rules` fails validation with `rules: Required`. Write the rule as the condition to match, for example "Label an email when it is an account-security notification about a service this mailbox holds an account with: password reset, new sign-in or new device alert, MFA change, lockout, or breach notice." Labels apply on arrival; manual assignment of a label to an existing email is not exposed - do not attempt it.

Owner alert (`send_email`): explicit `to` from user-supplied owner address, `body.from` = the mailbox address (`public_id` is not a valid From), `body.text` and/or `body.html`, and `body.source_draft_id` set to the previewed alert draft so that draft is retired on send. Preview exact recipients and body before the approved single send. The response is `status: "queued"` with an `undo_until` timestamp; a send is recallable only inside that short window.

Triager (`create_task_triager`): instructions must be classify-and-draft only. A triager may label and draft an alert; delivery always returns to a human-approved send.

Default triager, present without being created: every mailbox ships with a system triager (`systemKey: default.email_response`, `isDefault: true`, `priority: 10000`, `deletable: false`) whose `email.auto_draft_response` task fires on every inbound message and writes a customer-service reply draft addressed to the sender. `list_task_triagers` shows it; `list_recent_triager_runs` shows what it did. It is gated by `requireApproval: true` on the task config and `settings.agentAutoResponse.requireApproval` on the mailbox, so it drafts but does not send. See `security.md` for the handling rule.

## Plan and credit caveats

- Reads and searches consume workspace API credits; keep registry rebuilds incremental (search since the last registry update, not from scratch).
- MCP attachment reads are limited to small files; this workflow never needs attachments.
- The full tool surface above is available on an API-key connection; no OAuth-only tool is required.
