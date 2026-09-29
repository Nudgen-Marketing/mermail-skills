# PR salvage / review corpus — mermail-base-usdc-invoice

Stale-PR, reopen, and review-thread salvage notes for **this skill’s PR lifecycle** (upstream `Nudgen-Marketing/mermail-skills`, skill `mermail-base-usdc-invoice`). Not a generic repo bot corpus.

## Lifecycle states

| State | Signal | Salvage action |
| --- | --- | --- |
| Fresh / open | PR open, CI green (`validate.mjs`), awaiting human review | One short maintainer poke; keep evidence refs current |
| Stale-PR | Open ≥ several days, no human review, only bot comments | Rebase/push only if validate still green; refresh evidence; single polite bump — no spam |
| Review-thread | Maintainer requested skill/docs changes | Address in-skill under `references/`; re-run `node tests/validate.mjs`; reply on the thread with what changed |
| Reopen-flow | Closed without merge (stale or superseded) | Confirm skill still needed → reopen or open successor PR from same branch tip; cite validate line + skill id |
| Merged | On default branch | Stop salvage; route follow-ups to new issues if any |

## Golden salvage cases

### S1 — stale open PR (bot-only reviews)

- Condition: OPEN, MERGEABLE, zero human reviews, ecc-tools comments only.
- Salvage: ensure `SKILL.md` links all shipped references; `node tests/validate.mjs` → Validated 18 skills; leave **one** human teammate comment asking for a maintainer pass.

### S2 — review-thread fix

- Maintainer: “add harness / triage evidence.”
- Salvage: add skill-scoped refs (`harness-compat`, `discussion-triage`, etc.), wire from `SKILL.md`, push; reply with paths + validate result.

### S3 — reopen after close

- Closed as stale while skill still contest-relevant.
- Salvage: reopen same PR if branch tip is clean; else new PR with same skill dir; never force-push rewritten history onto a shared review branch without agreement.

## Do not

- Force-push over review commits.
- Impersonate maintainers or flood comments.
- Invent unrelated TypeScript analyzer corpora to “green” bots — keep evidence skill-local.
