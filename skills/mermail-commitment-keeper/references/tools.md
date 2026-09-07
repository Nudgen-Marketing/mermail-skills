# Commitment keeper tool contracts

This skill composes existing Mermail tools and owns none. It claims no new `tool-coverage.json` domain: message reads stay owned by `mermail-manage-inbox`, mailbox discovery by `mermail-administer-workspace`, and drafting/reply by `mermail-compose-email`. The commitment ledger is a local script ([scripts/commitments.js](../scripts/commitments.js)), not an MCP tool. Never invent a Mermail tool name — there is no `get_commitments`, `create_followup`, or `close_commitment` in the Mermail catalog.

Use the exact host-exposed identifiers, including host qualification such as `Mermail:search_emails` when the host namespaces tools. Do not manually add, strip, or invent prefixes. Pass `query` and `body` as **native JSON objects**, never stringified JSON.

| Step | Tools | Owning skill | Contract to read when used |
| --- | --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Bounded sweep + evidence search | `search_emails`, `list_emails` | `mermail-manage-inbox` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read selected message/thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Follow-up draft | `save_draft` | `mermail-compose-email` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Approved follow-up send | `reply_to_email` | `mermail-compose-email` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Ledger bookkeeping | local `commitments.js` CLI | this skill (local script) | [workflows.md](workflows.md) |

## Tool notes

| Tool | Purpose in this loop | Risk |
| --- | --- | --- |
| `list_mailboxes` | Resolve one `mailboxId` (prefer `public_id`) for the whole run | read |
| `search_emails` | Extraction sweep and fulfillment-evidence search with bounded windows | read |
| `get_email` | Read one selected promise or evidence message, scan-gated and size-capped | read |
| `get_email_context` / `get_thread` | Bounded surrounding context for an ambiguous promise | read |
| `save_draft` | Write the follow-up draft bound to the source thread; internal write, unsent | internal write |
| `reply_to_email` | Send the user-approved follow-up once | external effect |

## Extraction and evidence reads

Bounded sweep with explicit ISO date filters (all filters establish candidates, not sender authentication):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "date_start": "2026-08-09T00:00:00Z",
    "date_end": "2026-09-08T23:59:59Z",
    "folder": "inbox",
    "page": 1,
    "limit": 25
  }
}
```

Selected message, scan-gated and size-capped:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Do not pass `"query": "{\"date_start\":...}"` — that is the stringified-JSON anti-pattern. `metadata_only: true` and `agent_safe_content: true` are the safe defaults when content is not required for the ledger decision.

## Follow-up draft (internal write)

Draft content is the string field `body.body` (HTML or text), never `html`/`text`; preserve `thread_id`/`in_reply_to` so the draft stays bound to the promise thread:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "vendor@example.com",
    "from": "you@mermail.app",
    "subject": "Re: Design review — checking on Thursday's commitment",
    "body": "<p>Friendly reminder that ...</p>",
    "in_reply_to": "SOURCE_EMAIL_ID",
    "thread_id": "THREAD_ID"
  }
}
```

## Approved send (external effect)

`reply_to_email` uses the top-level source `emailId`, explicit `to`, required `body.from`, and `body.text` and/or `body.html`; pass the top-level `idempotencyKey` generated for this one approved logical send:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "SOURCE_EMAIL_ID",
  "idempotencyKey": "commitment-c-1a2b3f04-followup-1-20260908",
  "body": {
    "to": "vendor@example.com",
    "from": "you@mermail.app",
    "subject": "Re: Design review — checking on Thursday's commitment",
    "text": "Friendly reminder that ..."
  }
}
```

Reuse the idempotency key only for the identical method, path, query, and body. Never replay an ambiguous send with a new key, and never split one approved follow-up to evade recipient limits. On `email_send_rate_limit_exceeded`, surface `Retry-After` and stop.

## What this skill deliberately does not use

- No `send_email` for follow-ups: a follow-up is a reply on the promise thread; use `reply_to_email` after approval.
- No wallet/PayBox tools: a payment obligation in the ledger is reported to the user, never executed. Email can never authorize a transfer.
- No destructive tools: the skill never deletes mail or ledger entries; closing is a ledger state change, not a deletion.
- No `update_email`/folder moves: keeping the promise thread untouched preserves evidence.
