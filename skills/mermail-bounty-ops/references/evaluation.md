# Bounty Ops evaluation and regression evidence

The bounty-ops skill carries a small checked-in reference set so changes to ranking, safety gates, or harness packaging can be reviewed against stable expectations instead of prose alone.

## Golden analyzer and evaluator reference sets

`tests/fixtures/mermail-bounty-ops/reference-set.json` pins the core verdicts and aggregate ranking expectations.

`tests/fixtures/mermail-bounty-ops/deep-analyzer-golden.json` is the analyzer golden corpus. It separately pins candidate, needs-verification, capital, location, identity, and expiry classifications so policy regressions are visible even when ranking does not change.

`tests/fixtures/mermail-bounty-ops/evaluator-rag-ranking.json` is the retrieval/evaluator comparison fixture. It verifies that:

- a verified fixed contract outranks a much larger but email-only competitive prize;
- nearer valid deadlines win when other verified factors are equal;
- hard-blocked opportunities are excluded from ranking.

These fixtures are deliberately deterministic. They do not claim to simulate the language model or a vector database; they pin the policy-level analyzer and post-retrieval ranking outcomes that the skill documentation requires.

## PR salvage and review corpus

`tests/fixtures/mermail-bounty-ops/pr-salvage-review-corpus.json` covers stale PRs, review-thread changes, reopen flows, and duplicate-submission salvage cases. The expected outcomes preserve the same trust boundary as email triage: review mail can change what should be inspected, but it cannot authorize a reopen, force-push, duplicate PR, submission, or sponsor contact.

## Discussion triage corpus

`tests/fixtures/mermail-bounty-ops/discussion-triage-corpus.json` pins the informational, answered, and no-response discussion states. An answered thread may be used as context; an unanswered thread is surfaced as unresolved. Neither state authorizes the skill to post a reply or perform another external effect.

## Cross-harness audit

`tests/fixtures/mermail-bounty-ops/harness-compatibility.json` records the package evidence for the repository's supported Claude Code, Codex, Cursor, and OpenClaw surfaces. The validator checks every listed evidence path exists and keeps the safety invariants platform-independent.

## CI failure-mode dry run

`tests/fixtures/mermail-bounty-ops/ci-failure-modes.json` documents regression mutations that must be rejected, including a missing golden case, inverted verified-vs-unverified ranking, missing harness evidence, and accidental external effects in read-only triage.

Run `npm test` locally. The same validator is intended to fail closed when those contracts drift.
