# Workflow and local reference implementation

Resolve the workspace and one exact available mailbox through the admin owner. Bind email and public ID plus workspace ID in the private ledger. Stop on ambiguity. A From header alone is insufficient to classify a message as owner-sent.

Discover metadata within a stated window (first run defaults to 30 days). Revisit selected open ledger items even when their source dates are older. The whole pass shares 100 metadata candidates, 30 threads, 20 interpreted body/context messages, 10,000 characters per message and 40 read calls. Do not widen repeatedly after empty results. Use native query objects, safe content and clean scan gates through the inbox owner; opaque context cursors are not timestamps. Report unprocessed/truncated/blocked evidence. Do not advance a global cursor beyond work actually completed.

Extract newest content only, excluding quotes/signatures, under [extraction.md](extraction.md). Compare against existing items using workspace/mailbox, thread, source message and item type. Identical words in another message are another candidate, not automatically a duplicate. Partial snapshots retain absent historical items as not observed; they do not delete them or reopen previously resolved entries.

Review any closure against the exact obligation and participants. A later message with an attachment or another promise does not by itself prove fulfillment or acceptance. Store the source and later evidence IDs. Missing evidence or a passed deadline is not proof of breach. Keep human notes, existing draft IDs and uncertain outcomes intact.

For private persistence, select a path outside the skill/public repository. The helper uses schema version 2, identity binding, an exclusive local lock, byte comparison and atomic replacement. A conflicting writer, stale lock, malformed/symlink file or legacy unbound schema stops for review; no automatic lock clearing or destructive migration. It is not a cross-host database. Retain the prior ledger until an explicitly reviewed migration copy is ready.

Rank open items using the original urgency heuristic: overdue 50 plus 5/day capped at 30 extra; deadline within three days 30; other-side silence 2/day capped at 25; owner-side age 1/day capped at 15; known deadline 10; high confidence 10; total capped at 100. Resolved items score zero. This is a triage aid, not probability or a contractual breach score. Report Overdue, Waiting on others, Waiting on you and fulfillment evidence, including audit gaps and source IDs.

Prepare nudges only when requested for selected items: overdue or at least four days silent, medium/high confidence, at most one per thread and none already pending/uncertain or drafted in the last seven days. Preview complete recipients/body/thread/quote/signature under the compose owner. Record pending intent and, after success, the exact draft ID; uncertain save stops for one authoritative inspection, not another save. A human-edited existing draft is not replaced. Status updates for owner obligations and optional capture automation follow [promise-ledger.md](promise-ledger.md). This persona never sends, creates a triager itself, or runs in the background.

## Offline helper

The helper does not fetch mail, authenticate evidence, scan content, configure automation or save Mermail drafts. Its input is a bounded operator-reviewed normalized snapshot, not a raw MCP payload or a client-supplied proof of trust. See the extraction reference for the normalization boundary.

The repository test fixture is under `tests/fixtures/commitment-radar/inbox.json`, outside the published skill payload. It includes deliberately adversarial test mail, not operational instructions. Run it only as offline test data with a deliberately chosen private output path:

```bash
python3 -B skills/mermail-commitment-radar/scripts/commitment_radar.py scan --inbox tests/fixtures/commitment-radar/inbox.json --ledger /private/chosen-directory/commitment-ledger.json --now 2026-10-06T09:00:00Z
python3 skills/mermail-commitment-radar/scripts/commitment_radar.py brief --ledger /private/chosen-directory/commitment-ledger.json --now 2026-10-06T09:00:00Z
python3 skills/mermail-commitment-radar/scripts/commitment_radar.py nudges --ledger /private/chosen-directory/commitment-ledger.json --now 2026-10-06T09:00:00Z
python3 skills/mermail-commitment-radar/scripts/test_commitment_radar.py
python3 skills/mermail-commitment-radar/scripts/test_ledger_regression.py
```

The directory must already exist; paths containing symlink parents are deliberately unsupported. The first three commands only update/read a local ledger and print text. Printed nudges are proposals, not saved drafts or sends. Existing examples/demo transcripts are historical illustrations, not evidence for the modified head.
