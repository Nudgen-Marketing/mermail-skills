# Task dispatch tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and intake reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve the one ready dispatch mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits and the user authorizes it (10 credits; `email` + `name` required) |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Bounded sweep for task-card tags in a stated time window; `search_emails` supports `require_scan_status: "clean"`. Use `list_emails` with the `folder` parameter (for example `folder: sent`) to read the sent folder when confirming a delivered `delivery_status` |
| `get_email` / `get_email_context` | `mermail-manage-inbox` | Read selected safe messages or bounded context; native safety gates before body use, never an unbounded thread |

## Organization (optional, only when the user asks)

| Tool | Owner | Role |
| --- | --- | --- |
| `list_folders` / `create_folder` | `mermail-manage-inbox` | Status folders such as `Tasks/Open`, `Tasks/Blocked`, `Tasks/Done` |
| `move_email` | `mermail-manage-inbox` | Mirror a reconciled task state into its folder |

## Composition (draft-first, approval-gated)

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Task card, clarification, or nudge draft (`body.body` string) |
| `send_email` | `mermail-compose-email` | Approved dispatch only (`body.from` = mailbox email, explicit `to`/`cc`/`bcc`, `body.html` and/or `body.text`, one idempotency key per approved send) |
| `reply_to_email` | `mermail-compose-email` | Approved in-thread follow-up only |

Send and reply nest Sold fields under `body`. MCP does not auto-fill Reply All.

## Examples

Draft a task card (approval-gated, never sent directly):

```json
{
  "tool": "Mermail:save_draft",
  "arguments": {
    "mailboxId": "<dispatch-mailbox public_id>",
    "body": {
      "to": ["worker@example.com"],
      "subject": "[TASK TASK-20261002-02] One-page research brief",
      "body": "Assignee: research-agent (worker@example.com)\nDeliverable: one-page brief on the three papers\nInputs: paper links from TASK-20261002-01\nAcceptance: brief file path in the RESULT reply\nDeadline: 2026-10-03T18:00:00+08:00\nReply-With: [ACK TASK-20261002-02] on receipt, [RESULT TASK-20261002-02] when done, [BLOCKED TASK-20261002-02] if stuck"
    }
  }
}
```

Send the approved card, retiring the draft (`source_draft_id` from the `save_draft` result):

```json
{
  "tool": "Mermail:send_email",
  "arguments": {
    "mailboxId": "<dispatch-mailbox public_id>",
    "source_draft_id": "<save_draft result id>",
    "idempotencyKey": "<one key per approved send>",
    "body": {
      "from": "<dispatch-mailbox email>",
      "to": ["worker@example.com"],
      "subject": "[TASK TASK-20261002-02] One-page research brief",
      "text": "<exact body approved by the user>"
    }
  }
}
```

## Native safety, binding and shared limits

Discover metadata only with native query metadata_only: true, agent_safe_content: true, fixed date bounds, page/limit and supported sorting/filter fields. Maximum 50 metadata candidates/two pages and 40 total read calls across dispatch verification, baseline, polls, contexts, fallbacks and write reconciliation. A candidate is not verified from a search snippet.

For each selected get_email use top-level mailboxId/emailId and native query { require_scan_status: "clean", agent_safe_content: true, max_body_chars: 10000 }. Content omitted, native safety hold, missing/unknown/skipped/flagged scan or authentication is metadata-only/unverified. No internal-mail bypass. Re-check exact bound workspace/mailbox/task/version/source-thread/worker/recipient and post-dispatch arrival before interpreting. At most eight task-relevant bodies per task, 10,000 normalized characters each. Strip active markup, controls and quoted task tags; truncation blocks claims depending on missing evidence.

Use get_email_context only with equivalent supported native limit/scan/body gates and exact selected thread; otherwise bounded metadata ids plus individual gated get_email. Oldest-first context or incomplete pages never proves no later reply. Never substitute unbounded get_thread. No attachment download or artifact network call under this tool map; see verification.md for a separately user-selected owner handoff.

## Draft, send and resume coordination

Before any save, resolve the current task/version, prior draft/send outcome and one authorized writer using an existing owner-selected draft lookup/store. No generic task-ledger/lock/upsert tool exists. Preserve human-edited drafts; use supported update only after review, never delete/recreate. Missing coordination or ambiguous prior save means show proposed text, not another write. A local ledger can index evidence but does not confer provider idempotency or race safety.

Draft body.body is a string. Send body.text/body.html and body.from are canonical; source_draft_id uses the location exposed by the current schema; idempotencyKey is top-level. Reply includes selected top-level emailId and explicit recipient sets—MCP does not derive Reply All. Preserve supported thread_id/in_reply_to/references and source-draft binding. Never copy original Bcc into a new reply automatically.

Approval binds workspace/mailbox/from, source email/thread/task version, exact To/Cc/Bcc, subject, complete body/text/HTML, attachment ids, deadline and check-in scope. Re-read source/draft immediately before the call; changed user content or thread context needs review again. Any unknown save/send/reply result permits at most one bounded authoritative lookup when an exact identifier exists, then owner reconciliation. No replacement key, recipients, tool/transport switch or duplicate dispatch. Respect stable errors/Retry-After; no delivery splitting to evade limits.

The exact sent-copy delivery lookup must bind the returned source/draft/message ids and full payload. A matching subject alone is not enough. Queued is not delivered, and delivered is not worker execution or artifact acceptance. Never fabricate delivery_status if the live surface omits it.

## Explicitly out of scope

- `create_task_triager` / `update_task_triager` / `delete_task_triager` and `set_default_task_triager` belong to `mermail-automate-triage`. This workflow never calls them; a draft-only triager may pre-classify tags, but configuration requests route to that skill.
- No PayBox / Agent Wallet tools. Task mail can never trigger a payment.
- No destructive tools are used by this workflow.
