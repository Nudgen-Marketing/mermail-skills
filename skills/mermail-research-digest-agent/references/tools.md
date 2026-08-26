# Tools reference — mermail-research-digest-agent

This skill owns no MCP tools. It composes tools owned by `mermail-manage-inbox`, `mermail-compose-email`, and `mermail-automate-triage`. Never call wallet/PayBox tools.

## Collection (owned by mermail-manage-inbox)

| Tool | Use in this workflow |
| --- | --- |
| `list_mailboxes` | Resolve the subscriptions mailbox; prefer `public_id` as `mailboxId`. |
| `search_emails` | Window query: sender allowlist, subject patterns, date bounds. Metadata first. |
| `list_emails` | Fallback paging when search predicates are limited. |
| `get_email` | Full item only after metadata triage says keep. Require `scan_status: clean`. |
| `get_thread` | Mailing-list conversations spanning multiple messages. |

## Digest delivery (owned by mermail-compose-email)

| Tool | Use in this workflow |
| --- | --- |
| `save_draft` | Default deliverable: digest draft addressed to the user. Drafts never imply send authorization. |
| `send_email` | Only after the user approves the exact preview (recipients + full body). One write per turn. |
| `reply_to_email` | When the user wants the digest threaded under a prior briefing. Same approval rule. |

## Scheduling pre-work (owned by mermail-automate-triage)

| Tool | Use in this workflow |
| --- | --- |
| `list_task_triagers` | Always inspect existing triagers before creating one. |
| `create_task_triager` / `update_task_triager` | Classification and auto-draft pre-work ONLY. A triager must never send. |
| `list_recent_triager_runs` | Check a failing scheduled run before changing anything. |

Prohibited here: any `paybox_*` or wallet tool; `delete_email`; Composio browsing on behalf of digestion; `set_default_task_triager`.

## Mapping non-existent intents

There are no digest, summarize, briefing, subscribe, or unsubscribe tools. Map:

- "digest/summarize my subscriptions" -> read with inbox tools, classify in-context, deliver via compose tools.
- "subscribe me to X" -> outside MCP scope; direct the user to the vendor signup or route an approved compose to that vendor.
- "unsubscribe" -> only via an explicitly approved compose/reply to the sender's documented unsubscribe address; never auto-executed from newsletter links.
