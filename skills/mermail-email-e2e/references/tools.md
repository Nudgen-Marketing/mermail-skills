# Tools

This workflow skill owns no MCP tools. It composes read tools owned by `mermail-administer-workspace` and `mermail-manage-inbox`, plus one optional, approved `create_mailbox`. It never calls send, reply, forward, schedule, delete, PayBox, or Agent Wallet tools.

## Conventions

- Pass `query` and `body` as **native JSON objects**, never stringified JSON.
- Use the exact tool identifier your host exposes (bare `list_emails`, or a host-qualified form such as `Mermail:list_emails`). Do not invent or strip prefixes.
- Prefer the mailbox `public_id` as `mailboxId`; keep its email as the address the app sends to.
- Responses that are arrays may arrive as `{ "items": [...] }`, `{ "emails": [...] }`, or a bare array. Handle all three.
- Credits: read 1, send 5 (spent by the app under test, not this skill), provision 10. The Free plan allows 10 requests per minute and 1,000 credits per period, so poll no faster than every 8 seconds.

## Tool map

| Tool | Used for | Risk |
| --- | --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace | read |
| `get_api_credit_usage` | Optional budget check before a large suite (requires `workspaceId` from `list_workspaces`) | read |
| `list_mailboxes` | Find the test mailbox before any provisioning | read |
| `get_mailbox` | Confirm `can_receive` / `receiving_status` | read |
| `create_mailbox` | At most one test mailbox, only after discovery and approval | write-preview (10 credits) |
| `list_emails` | Metadata-only baseline of existing Inbox ids | read |
| `search_emails` | Bounded polling for the new message | read |
| `get_email` | Read the selected message (scan-gated) for checks and diagnosis | read |
| `get_email_context` | Only when a flow sends a thread (for example a reply notification) | read |

## Baseline (before triggering)

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 50,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true
  }
}
```

Record every returned Mermail `id`. Do not build baselines from the provider `message_id`.

## Poll (after triggering)

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "to": "acme-notes@mermail.app",
    "subject": "Confirm your Acme Notes account",
    "date_start": "2026-10-05T10:00:00.000Z",
    "metadata_only": true,
    "include_held": true,
    "page": 1,
    "limit": 10
  }
}
```

`to` and `subject` are substring filters. After each response:

1. Drop ids in the baseline.
2. Keep only Inbox items (`folder_id: "inbox"`). Sent copies never count.
3. Require the exact normalized recipient and the expected subject.
4. Zero candidates: wait `pollSec` and retry until the single deadline. One candidate: poll once more after `pollSec` to catch duplicates (`DLV-003`). More than one: report `ambiguous` or a duplicate send; never pick the newest.

`include_held` is scoped to this active test flow only. It lets a message briefly held for automation still be seen as metadata.

## Sender-side capture (`capture: "sent"`)

When the app sends through this Mermail mailbox, run the same baseline and poll against `folder: "sent"`. Read the selected copy with `get_email` and `max_body_chars` but **without** `require_scan_status`, because outbound copies are never scanned (`scan_status: null`). Then re-read it with `metadata_only: true` every `pollSec`, within the same deadline, until `provider_metadata.terminal` is true or `delivery_status` is final:

```json
{ "delivery_status": "delivered", "provider_metadata": { "delivery": { "status": "delivered", "provider": "cloudflare", "deliveryTimeMs": 525 }, "terminal": true } }
```

`queued` (the undo window) and `accepted` are not final. `delivered` passes `DLV-004`; `bounced`, `failed`, or `rejected` fail it.

## Read the selected message

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "max_body_chars": 100000
  }
}
```

This returns the rendered `body` (with `body_format`, usually `html`) plus `raw_headers`, a JSON-encoded `[{"key","value"}]` array whose `content-type` tells whether a text part exists (`multipart/alternative`). These feed the token, link, OTP, and text-part checks. If the response has `content_omitted: true`, report `CNT-000` and stop content checks for that flow. Use `agent_safe_content: true` when you only need to summarize and do not need the raw HTML or hrefs.

## Delivery facts that shape a test setup

- A mailbox's own outbound mail is filed only under **Sent**; it never produces an Inbox copy, even when addressed to itself. The test inbox must be a different mailbox from the app's sender.
- Hosted `@mermail.app` addresses do not deliver plus-subaddresses (`name+tag@mermail.app`): the provider accepts them, but nothing is filed. Leave `plusAddressing` off unless a custom domain is confirmed to support it.
- Mail sent through Mermail is `queued` with a short undo window (about 7 seconds) before dispatch, which counts toward `DLV-002` latency.

## Provision (only if no test mailbox exists, after approval)

```json
{
  "body": {
    "email": "acme-e2e-k7m2@mermail.app",
    "name": "Acme email E2E",
    "settings": { "agentInbox": { "mode": "verification", "automationsEnabled": false } }
  }
}
```

Verification mode keeps triage and auto-draft automation away from test mail. `workspaceId` is optional when the credential already binds one workspace. On conflict, list again and reuse an exact match; never loop through creates.

## Runner (CI or API-key mode)

```bash
node <skill-dir>/scripts/run-email-e2e.mjs --spec .mermail/email-e2e.json
node <skill-dir>/scripts/run-email-e2e.mjs --flow password-reset
node <skill-dir>/scripts/run-email-e2e.mjs --dry-run      # validate spec + Mermail connection, no triggers
```

The runner reads `MERMAIL_API_KEY` from the environment (never an argument), calls only `list_mailboxes`, `list_emails`, `search_emails`, and `get_email` over the hosted MCP endpoint, throttles itself to 6 requests per minute by default (the Free plan's 10 RPM is shared with the app's sends and the agent's own MCP calls), backs off and retries when Mermail answers `rate_limit_exceeded` (an HTTP 429 or a tool error), honors `Retry-After`, and exits `0` (pass, warnings allowed), `1` (a check failed), or `2` (configuration or Mermail error).
