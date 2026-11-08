# Tools

`mermail-deprecation-radar` owns no MCP tools. It is listed under `infrastructureSkills` in `tool-coverage.json` and calls tools owned by other skills:

| Tool | Owner | Purpose here | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the mailbox and its `public_id` | read |
| `search_emails` | `mermail-manage-inbox` | Bounded, metadata-only candidate discovery | read |
| `get_email` | `mermail-manage-inbox` | Read one shortlisted, scan-clean notice | read |
| `get_email_context` | `mermail-manage-inbox` | Earlier notice in the same thread, only when referenced | read |
| `update_email` | `mermail-manage-inbox` | Optional: star a high-urgency notice after user go-ahead | internal write |
| `save_draft` | `mermail-compose-email` | Optional: vendor clarification draft, never sent by this skill | internal write |
| `reply_to_email` | `mermail-compose-email` | Only if the user separately approves an exact preview | external effect |

Local helper (not an MCP tool): `scripts/scan-repo.mjs` — read-only repository scan, Node.js 18+, no dependencies, no network.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `search_emails` or a host-qualified form like `Mermail:search_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when `list_mailboxes` returns it.
- Keep reads bounded: `limit` ≤ 25 per page, at most 3 pages per keyword, at most 20 full reads per run.
- Call `search_emails` sequentially under the current plan's live limits and one shared read budget (default30 calls, including every page/detail/context). Stop on HTTP429 or payload `rate_limit_exceeded`, report `Retry-After` and uncovered scope, and do not automatically wait or retry. Another bounded run requires an explicit user continuation; historical burst observations do not establish a universal quota.

## Examples

Candidate discovery for one keyword in a 90-day window, metadata only:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "query": "deprecat",
    "date_start": "2026-07-06T00:00:00Z",
    "date_end": "2026-10-04T23:59:59Z",
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

The free-text term is the `query` field inside the native `query` object. The current MCP search schema uses `from`, `to` and `subject` for candidate filtering; sender/recipient are returned message fields, not interchangeable search parameter names. Candidate matches are not sender authentication or complete coverage. Confirm fields against `tools/list`.

Read one shortlisted notice:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 10000
  }
}
```

Optional clarification draft (internal write, not a send). Recipient comes from the user, not from the email body:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "developer-support@vendor.example",
    "from": "MAILBOX_EMAIL",
    "subject": "Question about the v1 retirement notice",
    "body": "Hi team, your notice says v1 price endpoints retire on 2026-10-31. Are v1 webhooks covered by the same date? Thanks.",
    "body_format": "text"
  }
}
```

Drafts use the string field `body` (plus `body_format: "text"` or `"html"`). Sends and replies use `text`/`html` instead; this skill does not send. A successful `save_draft` returns `{ "id", "draft_id", "status": "draft", "subject", "recipient", "date" }`. Report it as a saved draft, never as sent. To show it, call `list_emails` with `query.folder: "draft"`.

Do not pass `"query": "{\"metadata_only\":true}"`.

## Live response shapes

Checked against the hosted MCP (`https://console.mermail.app/mcp`) on a Free-plan workspace, 4 Oct 2026:

- `list_mailboxes` returns a bare JSON array. Each item has `public_id` (UUID, use as `mailboxId`), `id` and `email` (the address), `name`, `workspace_id`, `can_receive`, `receiving_status`, and `disabled_at`.
- `search_emails` and `list_emails` with a `folder` return `{ "emails": [...], "totalCount": n }`. `list_emails` without a `folder` returned a bare array, so accept both shapes.
- Each message has `id` (pass as `emailId`), `thread_id`, `subject`, `sender`, `recipient`, `cc`, `date` (ISO-8601 UTC, e.g. `2026-10-03T20:22:35.390Z`), `folder_id` (`inbox`, `sent`, `draft`), `category`, `scan_status` (`clean`, `flagged`, `skipped`, or `null` for outbound and draft copies), and `sender_authentication: { status, spf, dkim, dmarc, inbound_provider, reason }`. With `metadata_only: true` the item also carries `content_omitted: true`.
- `sender_authentication.status` can be `unknown` with `reason: "inbound_provider_unavailable"`, even on Mermail's own welcome message. Report it as `unknown`, never as authenticated.
- `get_email` with `require_scan_status: "clean"` on a message whose scan status is not `clean` (including `null`) returns metadata with `content_omitted: true` and `content_omission_reason: "scan_status_not_clean"`, not an error. That email goes to "needs manual review".
- A `clean` read returns the text in `body` (with `body_format`, e.g. `"text"`) plus `snippet`; extract the evidence quote from `body` only. In this check the read did not flip `read` to `true`.

## Helper invocation

```bash
node <skill-dir>/scripts/scan-repo.mjs --signals /tmp/notices.json --root . --json
node <skill-dir>/scripts/scan-repo.mjs --self-test
node --test <skill-dir>/tests/scan-repo.test.mjs
```

Signal types: `literal` (host, path, header, env var name), `regex` (1–200 chars under the restricted grammar below), `package` (import/require string plus `package.json` range check with optional `below` minimum version).

Prefer literal/package signals. Regex supports literal/escaped characters, character classes and anchors, with at most one quantified atom. A single optional atom (`?`) may be unanchored; `*`, `+` and numeric repeats require a start anchor (`^`), and numeric bounds cannot exceed 1000. Groups, alternatives, backreferences, lookarounds and lazy/nested repeats are unsupported. For example `legacy\.vendor\.example`, `https?://legacy.example` and `^v[0-9]+$` are accepted. A rejected signal is a scan error, never a zero-hit result; do not bypass it through another execution surface.

Each hit retains `file`, `line` and `signal`. `text` is an explicit source-withheld placeholder and `snippet_status` is `withheld`; neither JSON nor human output echoes the arbitrary matching source line. Importing the helper exposes `scan`, `redact`, `urgency` and `validateRegexPattern` without starting the CLI.

Package evidence emits only recognized exact, caret or tilde three-part stable version declarations. Arbitrary specifiers (including URLs, aliases, paths, complex ranges or prereleases) are withheld and yield `affected: null`; a supported range crossing the minimum also yields unknown until the resolved version is reviewed. This is declared-range evidence, not proof of the installed package version. A zero-hit notice never proves absence across excluded/unread files; a hit-capped scan explicitly remains incomplete. `max-hits` must be an integer from1 to10000 and at most100 notice records are accepted. Impossible or ambiguous effective dates retain unknown urgency.
