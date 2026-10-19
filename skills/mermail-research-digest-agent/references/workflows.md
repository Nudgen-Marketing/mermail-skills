# Workflows — mermail-research-digest-agent

## 1. Setup (once per workspace)

1. Confirm MCP connectivity per repo-wide conventions (`mermail-mcp` handles auth problems).
2. Resolve or propose the subscriptions mailbox (`list_mailboxes`; optional `create_mailbox` with consent). Record email + `public_id`.
3. Agree topic taxonomy with the user (5-10 tags max) and window cadence (weekly default).
4. If explicitly requested, route inbound classification/auto-draft administration to the triage owner. A weekly timer is a different integration; offer a saved manual recipe when no actual scheduler was authorized.

## 2. Per-run sequence

1. Fix window bounds and max items. State them back in one line before reading bodies.
2. Metadata sweep: `search_emails` (window + allowlist). Count candidates.
3. Body pass for selected items only: native safe bounded `get_email` / `get_email_context` per tools.md, requiring clean per-message scans. Metadata alone cannot justify factual takeaways.
4. Account for each candidate; factual classification needs a safely read clean body. Record unsafe/unread exclusions separately; novelty needs a verified prior manifest, otherwise it is unknown.
5. Cluster into at most five themes ordered by user priority; cite sender + subject + message ID per entry.
6. Render digest artifact: dated title, executive summary, themes and unique-source counts, takeaways, proposed action items and sources block. Distinguish reported facts/opinions, contradictions and uncertainty. Add a private source-ID/content-version manifest; counts must not multiply a message assigned to two topics or conflate candidates with safely interpreted items.
7. A read-only summary stays in chat. Save a draft only when requested with known recipient and reconciled draft state; send/schedule once only with exact approval and the delivery.md gates. A local export uses a user-selected path through CLI conventions and no implicit upload.
8. Status line: scanned / kept / dropped, artifact ID, next-run reuse notes.

## 3. Repeated runs and one-time delivery

- Inbound triage automation performs classification/draft pre-work, not timed collection/batching. Inspect actual `list_recent_triager_runs` only for relevant triager troubleshooting.
- For one-time delayed delivery, freeze the exact digest and future timestamp/timezone, preview and approve `schedule_email_send` once. Report the returned schedule identity as scheduled, not delivered. A later inbox update does not alter/cancel its frozen content automatically.
- Recurring collection/regeneration needs a separately authorized actual scheduler and protected coordination; otherwise a manual recipe is all that exists. No unattended outbound delivery is established here.
- Repeated runs compare authoritative source manifests only. See [delivery.md](delivery.md) for included versus delivered IDs, changed-source revisions, overlapping windows, uncertain outcomes and limits of duplicate detection.

## 4. Escalation and failure

- Missing mailbox or zero candidates: report and ask; do not widen the window silently.
- Low-confidence clustering: show an explicit uncertainty note instead of guessing; save only a user-requested draft with confirmed recipient and reconciled state.
- Tool errors: name the tool, the error class, and the retry decision; never fabricate digest content to fill gaps.
