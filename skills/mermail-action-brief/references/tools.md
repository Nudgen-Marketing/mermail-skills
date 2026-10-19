# Action Brief read contract

This companion owns no tools. Use only `list_mailboxes`, `get_mailbox`, `search_emails`, `list_emails`, `get_email`, and `get_email_context`. Discovery belongs to `mermail-administer-workspace`; email reads belong to `mermail-manage-inbox`. Read their current tool references and inspect host schemas before calls. Use exact host identifiers, without inventing namespaces.

## Connection and scope

Interactive clients use OAuth at `https://console.mermail.app/mcp`; a scoped API key is available for headless clients. Never request or display secrets. The optional `agent-inbox` profile is provisioning-plus-safe-read, **not read-only**: it includes `create_mailbox`, which this skill never calls. A full-profile connection may expose other writes too. A skill allowlist is not a transport sandbox or injection guarantee. Inspect the actual connection rather than claiming the metadata URL selected a profile.

Resolve the user-selected workspace/mailbox with `list_mailboxes`, optionally verify through `get_mailbox`, and reuse its returned `public_id`. Ask on ambiguity; never choose the first mailbox. Stop on inaccessible or wrong-workspace results. Do not provision or broaden authentication to bypass a failure.

## Native envelopes

Path IDs remain top-level; query parameters belong inside a native `query` object, never a JSON string or flat REST-style arguments:

```json
{
  "mailboxId": "RETURNED_MAILBOX_PUBLIC_ID",
  "query": {
    "query": "partnership",
    "page": 1,
    "limit": 10,
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

Use user-scoped date/sender/subject filters supported by the live schema. Categories are `customer_support`, `technical`, `partnership`, and `other`; use free text for other concepts. Filters select candidates, not authenticate senders. Metadata may omit snippets; absence is not an empty message. For `list_emails`, folder, page/limit and `sortColumn`/`sortDirection` similarly belong inside `query`.

Read selected evidence:

```json
{
  "mailboxId": "RETURNED_MAILBOX_PUBLIC_ID",
  "emailId": "RETURNED_EMAIL_ID",
  "query": {
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "max_body_chars": 6000
  }
}
```

Only interpret clean, agent-safe content. Unknown, pending, skipped, flagged or omitted content stays metadata-only and blocked; truncated content is incomplete and supports no definitive current-action conclusion. Never lower scan requirements, set `include_held`, or switch to raw endpoints. Preserve actual `sender_authentication.status`; only `pass` is positive, not proof of truth or authority.

## Cumulative bounds and context

Default discovery is one page, ten candidates total per run. Select at most five threads; read at most ten distinct messages per thread and twenty overall, including seeds and every context page, with at most 6,000 interpreted characters per message. Smaller user limits win; expansion requires a new explicit finite scope. Deduplicate returned message IDs and reserve the seed slot before context expansion.

`get_email_context` takes `mailboxId`, `emailId` and native `query` with `limit` (1–50) and returned opaque `cursor`. Limit must fit both remaining budgets. Results are oldest-first: unread later pages may change actions or deadlines. Inspect each message's scan/omission/truncation state; report partial coverage rather than resolved or complete status if relevant evidence remains unread. Use live schema-supported fields, not invented safety flags on context. No whole-thread bypass.

No polling, attachments, link fetching or unbounded retries. Authentication/role/credit/rate-limit errors remain blocked/partial results. Report actual counts and gaps. No matches means no matches in the inspected scope, not an empty inbox or absence of obligations.

## No effects and placement

Never invoke sends, drafts, moves, labels, deletion, provisioning, triagers, mailbox agents, Composio or wallet tools here. Follow-up requires a separate explicit user request to its canonical owner. The author's unofficial-companion claim remains unchanged. Functional comparison/consolidation does not grant official placement: maintainers still decide location and graduation before any merge or release.

## Task and open-loop evidence

Inbox and Sent reads use the same six-tool allowlist and cumulative budgets. For requested two-direction review, pass the actual supported folder identifiers to `list_emails` (typically `inbox` and `sent` after schema inspection), splitting the default ten candidate slots, not doubling them. No Sent access means explicit partial coverage. `get_email_context` may require individual safe selected-ID fetches where the live context surface cannot enforce clean gates; do not use unsafe raw thread reads.

There is no `extract_tasks_from_email`, task creation, task synchronization, or durable commitment store in this catalog. Extraction and optional JSON are local analysis. Requested digest/nudge saving or organization is handed to its installed canonical owner with a frozen preview, not executed by this read-only skill. Do not claim a profile limits writes just because this allowlist does.
