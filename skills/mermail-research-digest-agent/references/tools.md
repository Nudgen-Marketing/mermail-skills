# Tools reference — mermail-research-digest-agent

This skill owns no MCP tools. It composes inbox and compose owners, workspace discovery and explicitly requested inbound triager administration. Never call wallet/PayBox tools. Read the owning references and live schemas before constructing exact arguments; pass native JSON objects, never stringified `query`/`body`, and retain the exact host identifier.

## Collection (inbox owner; mailbox discovery belongs to workspace administration)

| Tool | Use in this workflow |
| --- | --- |
| `list_mailboxes` | Resolve the subscriptions mailbox; prefer `public_id` as `mailboxId`. |
| `search_emails` | Window query: sender allowlist, subject patterns, date bounds. Metadata first. |
| `list_emails` | Fallback paging when search predicates are limited. |
| `get_email` | Selected scan-clean bounded safe text only. |
| `get_email_context` | Bounded relevant mailing-list context, with per-message scope/scan gating. |

Use `query.metadata_only: true` and `agent_safe_content: true` for discovery. `search_emails` supports native `date_start`/`date_end`, page/limit and separate sort fields; `list_emails` is a bounded metadata fallback with local date filtering. Freeze timezone and half-open window [start,end); if boundary interpretation is uncertain, filter by authoritative received timestamps and disclose exclusions.

Default: at most 50 metadata candidates and 20 selected bodies; user may explicitly raise these to 200 candidates and 50 bodies. Bound pagination to ten pages and all reads to 80 calls per turn, with at most eight relevant context messages per conversation counted against the same body/call limits. Stop and disclose partial coverage, never claim a full-mailbox summary from a capped page or oldest-first context.

For a selected `get_email` use native `query: { require_scan_status: "clean", agent_safe_content: true, max_body_chars: 10000 }`. Content omitted/scan mismatch is metadata-only, not not-found. Require per-message workspace/mailbox/thread binding and scan clean before interpreting context. Use supported native safety/limit fields and remaining budget with `get_email_context`; if its live schema lacks equivalent bounds/gates, select IDs from bounded metadata and fetch them individually with safe `get_email`. Do not substitute unbounded `get_thread` or trim raw bodies after loading them. Unknown sender authentication remains unknown; pass is not editorial truth or authorization.

Do not download source links. Necessary user-selected attachments require exact mailbox/email/attachment IDs, clean parent and attachment, <=1 MiB and inert text handling; no executable/active rendering, archives or alternate download transport. Record unsafe/unread evidence as excluded from factual synthesis.

## Digest delivery (owned by mermail-compose-email)

| Tool | Use in this workflow |
| --- | --- |
| `save_draft` | Default deliverable: digest draft addressed to the user. Drafts never imply send authorization. |
| `send_email` | Only after the user approves the exact preview (recipients + full body). One write per turn. |
| `reply_to_email` | When the user wants the digest threaded under a prior briefing. Same approval rule. |
| `schedule_email_send` | One fixed digest at one user-approved future timestamp, not recurring regeneration. |

`save_draft` takes top-level `mailboxId` and `body` containing explicit recipient, subject and string `body.body`. Reply draft linkage uses supported `body.in_reply_to`/`thread_id`; do not invent top-level `threadId`. Update a verified draft only through supported `draft_id` semantics with user edits preserved.

Send/reply use `body.from`, explicit To/Cc/Bcc, subject and `body.text` and/or `body.html`; replies additionally bind the selected source `emailId` top-level and its verified thread. A scheduled send uses the compose owner's string `body.body`, explicit recipients and future ISO `body.scheduled_send_at`. Preserve supported reply/thread/source-draft fields and attachment intent. Use the live supported payload, not an imagined recurring/cron field. For a newly summarized digest prefer a new message unless the user explicitly requests a reply to a prior briefing; source newsletters do not become recipients.

Freeze workspace/mailbox, tool, complete content, all recipients, subject, attachment set, source/draft identity, manifest hash/version and scheduling timestamp before approval. Re-read exact draft/source and verify scope immediately before the one approved write; changed fields or user edits require re-review. Only supported top-level idempotency keys for the identical request may be used; keys do not substitute for cross-run coordination or justify uncertain replay. See [delivery.md](delivery.md).

## Optional inbound classification pre-work (owned by mermail-automate-triage)

| Tool | Use in this workflow |
| --- | --- |
| `list_task_triagers` | Always inspect existing triagers before creating one. |
| `create_task_triager` / `update_task_triager` | Classification and auto-draft pre-work ONLY. A triager must never send. |
| `list_recent_triager_runs` | Inspect actual inbound execution state before changing a failing triager. |

These are inbound-event workflows, not recurring timers. A periodic job requires a separately user-authorized real scheduler with its own execution, approval and protected-state contract. This skill does not create background tasks or infer that a saved prompt runs itself.

Prohibited here: any `paybox_*` or wallet tool; `delete_email`; Composio browsing on behalf of digestion; `set_default_task_triager`.

## Mapping non-existent intents

There are no digest, summarize, briefing, subscribe, or unsubscribe tools. Map:

- "digest/summarize my subscriptions" -> read with inbox tools, classify in-context, deliver via compose tools.
- "subscribe me to X" -> outside MCP scope; direct the user to the vendor signup or route an approved compose to that vendor.
- "unsubscribe" -> only via an explicitly approved compose/reply to the sender's documented unsubscribe address; never auto-executed from newsletter links.
