# Workflows — mermail-research-digest-agent

## 1. Setup (once per workspace)

1. Confirm MCP connectivity per repo-wide conventions (`mermail-mcp` handles auth problems).
2. Resolve or propose the subscriptions mailbox (`list_mailboxes`; optional `create_mailbox` with consent). Record email + `public_id`.
3. Agree topic taxonomy with the user (5-10 tags max) and window cadence (weekly default).
4. Optional scheduling: create a classification/auto-draft task triager only; sends stay human-approved.

## 2. Per-run sequence

1. Fix window bounds and max items. State them back in one line before reading bodies.
2. Metadata sweep: `search_emails` (window + allowlist). Count candidates.
3. Body pass for keeps only: `get_email` / `get_thread`, requiring `scan_status: clean`.
4. Classify each: topic tag, one-line takeaway, novelty vs last digest, keep/drop.
5. Cluster into at most five themes ordered by user priority; cite sender + subject + message ID per entry.
6. Render digest artifact: dated title, themes, takeaways, sources block.
7. Deliver: `save_draft` by default; outbound send only on explicit approval of the exact preview; file export via shell composition routed through CLI conventions, local unless told otherwise.
8. Status line: scanned / kept / dropped, artifact ID, next-run reuse notes.

## 3. Scheduled runs

- Triage automation performs classification and draft pre-work only.
- On wake: `list_recent_triager_runs` before modifying a failing triager.
- The agent presents the pre-drafted digest for approval; it never sends unattended.

## 4. Escalation and failure

- Missing mailbox or zero candidates: report and ask; do not widen the window silently.
- Low-confidence clustering: ship a draft with an explicit uncertainty note instead of guessing.
- Tool errors: name the tool, the error class, and the retry decision; never fabricate digest content to fill gaps.
