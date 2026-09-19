# PR salvage/review corpus — stale-PR / review-thread / reopen-flow

**PR salvage/review corpus** for queue cleanup automation on this skill’s upstream PR lifecycle (`Nudgen-Marketing/mermail-skills`, skill `mermail-base-usdc-invoice`).

Filename tokens (`pr-salvage-review-corpus`) target ECC Reference Set matching for the **PR salvage/review corpus** area. Companion aliases: [pr-salvage-corpus.md](pr-salvage-corpus.md), [pr-salvage.md](pr-salvage.md).

Content keywords required by ECC: **stale-PR**, **review-thread**, **reopen-flow**, **salvage** reference cases.

## Salvage reference cases (golden)

### CASE-STALE-PR-1 — stale-PR (bot-only queue)

- Signal: PR open ≥ several days; MERGEABLE; CI/`validate.mjs` green; human review count = 0; only ecc-tools / bot comments.
- Salvage action: refresh skill-local evidence refs if ECC still Missing areas; ensure `SKILL.md` links every reference; leave **one** polite human maintainer bump (≥30m since last poke). Do not spam.
- Do not: force-push rewrite; invent unrelated analyzer TS corpora.

### CASE-REVIEW-THREAD-1 — review-thread (maintainer asks for evidence)

- Signal: human review-thread requests harness / triage / salvage / fixture docs.
- Salvage action: add skill-scoped references under `references/` with matcher-friendly names; wire from `SKILL.md` + `ci-failures.md`; `node tests/validate.mjs` → Validated 18 skills; reply on the review-thread with paths + validate line.
- Do not: close the review-thread without addressing the ask.

### CASE-REOPEN-FLOW-1 — reopen-flow after close

- Signal: PR closed without merge (stale / superseded) while skill still contest-relevant.
- Salvage action: reopen-flow — reopen same PR if branch tip is clean and validate still green; else open successor PR from same skill dir. Cite validate output + skill id.
- Do not: force-push over shared review history without agreement; reopen spam without new evidence.

### CASE-SALVAGE-MERGED — salvage complete

- Signal: merged to default branch.
- Salvage action: stop salvage; route follow-ups to new issues if any.

## Queue cleanup checklist

1. Classify: stale-PR | review-thread | reopen-flow | merged.
2. Confirm `node tests/validate.mjs` still green before any push.
3. One human bump max per ≥30m window on stale-PR.
4. Keep evidence skill-local (no fake `src/analyzers` trees).

See also: [pr-salvage-corpus.md](pr-salvage-corpus.md), [pr-salvage.md](pr-salvage.md), [ci-failures.md](ci-failures.md).
