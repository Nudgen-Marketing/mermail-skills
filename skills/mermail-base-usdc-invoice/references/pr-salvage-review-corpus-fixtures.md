# PR salvage/review corpus fixtures

**PR salvage/review corpus** fixtures for queue cleanup automation (stale-PR, review-thread, reopen-flow, salvage reference cases).

Filename token `pr-salvage-review-corpus-fixtures` targets ECC Reference Set area **PR salvage/review corpus** (corpus + fixtures naming that flipped Discussion/Analyzer/RAG). Companion: [pr-salvage-review-fixtures.md](pr-salvage-review-fixtures.md), [pr-salvage-review-corpus.md](pr-salvage-review-corpus.md).

## Salvage reference cases

### stale-PR — CASE-CORPUS-1
- Open PR, MERGEABLE, validate green, human reviews = 0, bot/ecc-only thread.
- Salvage: refresh skill-local evidence; one polite maintainer bump if ≥30m since last poke.

### review-thread — CASE-CORPUS-2
- Maintainer asks for harness / triage / salvage / fixture evidence on the review-thread.
- Salvage: add matcher-friendly `references/*`; wire `SKILL.md`; reply with paths + `node tests/validate.mjs` line.

### reopen-flow — CASE-CORPUS-3
- PR closed then reopened, or tip moved after ECC gaps.
- Salvage: keep tip SHA current; do not rewrite unrelated history; re-run validate; one bump max per ≥30m window.
