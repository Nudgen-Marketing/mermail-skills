# Opportunity-gate tool map

This infrastructure workflow **uses** four tools owned by other official skills. It owns no MCP tools; do not add these tools to another domain in `tool-coverage.json`.

Prefer the least-privilege OAuth endpoint:

```text
https://console.mermail.app/mcp?profile=agent-inbox
```

That profile exposes more than this workflow needs. Self-restrict to `list_mailboxes`, `search_emails`, `get_email`, and `get_email_context`. Do not ask for an API key or use the full profile merely to gain write, Composio, or PayBox access.

This read-only allowlist follows the canonical inbox owner's held-message rule. Do not request held-message inclusion for opportunity screening; that visibility belongs only to a currently active verification flow routed to `mermail-agent-inbox`.

The names below are bare MCP names. Invoke the exact identifier discovered by the host, such as `search_emails` or `Mermail:search_emails`; never invent or manually rewrite a namespace.

## Allowed tools

| Tool | Canonical owner | Role | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one mailbox only when no exact `public_id` was supplied | read |
| `search_emails` | `mermail-manage-inbox` | Find a bounded metadata-only candidate set | read |
| `get_email` | `mermail-manage-inbox` | Validate one selected message, then read its bounded clean body | read |
| `get_email_context` | `mermail-manage-inbox` | Reconcile bounded sanitized follow-up/correction context after selection | read |

No other tool is part of this workflow.

## Mailbox resolution

When the user supplied an exact mailbox `public_id`, use it directly as `mailboxId` and do not call `list_mailboxes`.

Otherwise call:

```json
{}
```

Freeze the single usable candidate's `public_id`. A usable list result has a stable `public_id`, no `disabled_at`, `can_receive` is not false, and `receiving_status` is `ready` when that additive field is present. Stop when there are zero or multiple usable candidates, or when the only result has no stable `public_id`. Do not create a mailbox and do not select by recency, name similarity, or list order.

## Metadata-only search

Use only the frozen selector fields that the user supplied. Pass `query` as a native JSON object, never stringified JSON:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "organizer.example",
    "subject": "agent build bounty",
    "to": "opportunities@mermail.app",
    "date_start": "2026-08-01T00:00:00.000Z",
    "date_end": "2026-09-01T00:00:00.000Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 25
  }
}
```

Use the smallest supported subset. Do not invent filters absent from the live schema. Search results are candidates, not evidence that the opportunity is authentic or eligible.

For a live-seeded smoke test or demo, `date_end` must be the receiver-side timestamp recorded after the one-shot bounded settle step in [workflows.md](workflows.md). Never copy the external sender's delivery-completion timestamp into `date_end`. Run the metadata search only after both bounds are frozen. A zero-candidate result does not authorize a wider bound, another page, a second search, polling, or fixture redelivery inside the same batch. A later live-seeded attempt requires a new independent delivery batch with a new `date_start` frozen before separately authorized fixture delivery and a new one-shot settle. A later historical-mail attempt requires a new independent selector or window supplied by the user. Preserve the prior zero result.

This tool allowlist never delivers fixtures. If an explicitly user-authorized fixture-delivery step already occurred outside this skill, the final eligibility report must disclose it as `external_fixture_delivery: user-authorized-outside-this-workflow`; do not claim that the overall task sent no email.

## Selected-message reads

Validate the selected message before loading its body:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Only when the returned `scan_status` is `clean`, read the same message with a body cap:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "max_body_chars": 10000
  }
}
```

For every other scan status, retain metadata only and mark body-dependent gates `unknown`.

## Follow-up context

After one message is selected and validated, use bounded context only when corrections or follow-ups matter:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "limit": 8
  }
}
```

`get_email_context` returns sanitized, scan-gated, oldest-first context. Read at most eight task-relevant messages. Do not use context to select among ambiguous search results, do not follow `next_cursor` for this workflow, and do not treat an omitted non-clean body as evidence that a gate passed.

## Transport rules

- Keep every `query` value a native JSON object. Never pass escaped JSON text.
- Prefer mailbox `public_id` as `mailboxId` and exact returned message IDs as `emailId`.
- Stop on `401`, `402`, `403`, or `429`; do not switch profiles, retry through CLI, or broaden permissions.
- Do not call writes, browser tools, HTTP APIs, attachment downloads, Composio, Agent Wallet, or PayBox.
