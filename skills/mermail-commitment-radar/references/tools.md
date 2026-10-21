# Tool ownership and envelopes

This persona owns no MCP tools. Use exact host-exposed identifiers and live schemas under the canonical owners. Native JSON objects are not stringified.

- `mermail-administer-workspace`: workspace/mailbox discovery. Select exact workspace and available mailbox public ID; do not provision one.
- `mermail-manage-inbox`: bounded search and selected email/context/thread reads. Prefer `get_email_context` with safe content and clean scan requirements. Use `get_thread` only when the live schema and remaining context budget permit.
- `mermail-compose-email`: requested `save_draft` only, preserving complete participants, exact thread and current draft. Saving is not sending. The persona itself never calls send/reply/forward/schedule tools.
- Optional capture-automation configuration belongs to `mermail-automate-triage` under independent user authority, not automatic invocation here. See [promise-ledger.md](promise-ledger.md).

Example metadata-first search envelope (match actual selected-host schema):

```json
{
  "mailboxId": "selected-public-id",
  "query": {
    "date_start": "2026-09-06T00:00:00Z",
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true,
    "limit": 20,
    "page": 1
  }
}
```

Use `query.require_scan_status: "clean"` on the owning inbox read where supported; a missing gate/status never becomes clean by assumption. `get_email_context` has bounded limit 1-50 and opaque cursor, not arbitrary full-history semantics. All queries share one 100-metadata/30-thread/20-body/40-read-call budget, and 10,000 characters per interpreted message. Respect RPM/plan/credits, stop on errors and report partial coverage; do not query usage on every item.

`save_draft` body carries actual rendered text in `body.body`, along with the live schema's exact recipient/subject/thread/signature fields. Preview full From/To/Cc/Bcc/body and source thread first. Inspect existing draft state before saving; preserve user edits. The local helper never calls it. Pending/uncertain draft outcomes must be reconciled before another effect, not retried with a different key.

`update_email` does not assign arbitrary custom per-message labels. This skill never labels, marks, moves or deletes mail. No ledger/resolve/nudge API, wallet access or background scheduler is invented. Local JSON storage is not a hosted API or automatic cross-agent sync service.
