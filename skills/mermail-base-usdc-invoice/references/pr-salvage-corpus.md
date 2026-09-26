# PR salvage / stale-PR review corpus — mermail-base-usdc-invoice

Stale-PR, review-thread, and reopen **corpus** for this skill’s PR lifecycle (upstream `Nudgen-Marketing/mermail-skills`, skill `mermail-base-usdc-invoice`). Alias companion to [pr-salvage.md](pr-salvage.md); filename includes `corpus` for ECC Reference Set matching.

## Corpus lifecycle states

| State | Signal | Salvage action |
| --- | --- | --- |
| Fresh / open | PR open, CI green (`validate.mjs`), awaiting human review | One short maintainer poke; keep evidence refs current |
| Stale-PR | Open ≥ several days, no human review, only bot comments | Rebase/push only if validate still green; refresh evidence; single polite bump — no spam |
| Review-thread | Maintainer requested skill/docs changes | Address in-skill under `references/`; re-run `node tests/validate.mjs`; reply on the thread with what changed |
| Reopen-flow | Closed without merge (stale or superseded) | Confirm skill still needed → reopen or open successor PR from same branch tip; cite validate line + skill id |
| Merged | On default branch | Stop salvage; route follow-ups to new issues if any |

## Corpus cases

### CORPUS-S1 — stale open PR (bot-only reviews)

- Condition: OPEN, MERGEABLE, zero human reviews, ecc-tools comments only.
- Salvage: ensure `SKILL.md` links all shipped references; `node tests/validate.mjs` → Validated 18 skills; leave **one** human teammate comment asking for a maintainer pass (do not re-poke under 30m).

### CORPUS-S2 — review-thread fix

- Maintainer: “add harness / triage evidence.”
- Salvage: add skill-scoped refs (`harness-compat`, `discussion-triage`, fixture aliases, etc.), wire from `SKILL.md`, push; reply with paths + validate result.

### CORPUS-S3 — reopen after close

- Closed as stale while skill still contest-relevant.
- Salvage: reopen same PR if branch tip is clean; else new PR with same skill dir; never force-push rewritten history onto a shared review branch without agreement.

## Do not

- Force-push over review commits.
- Impersonate maintainers or flood comments.
- Invent unrelated TypeScript analyzer corpora to “green” bots — keep evidence skill-local.

See also: [pr-salvage.md](pr-salvage.md), [ci-failures.md](ci-failures.md).
