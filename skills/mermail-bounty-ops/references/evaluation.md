# Bounty Ops evaluation and regression evidence

The bounty-ops skill carries a small checked-in reference set so changes to ranking, safety gates, or harness packaging can be reviewed against stable expectations instead of prose alone.

## Golden analyzer and evaluator reference set

`tests/fixtures/mermail-bounty-ops/reference-set.json` covers the hard verdicts and one ranking comparison that is easy to regress:

- a verified fixed contract remains a `candidate`;
- a much larger but email-only competitive prize remains `needs_verification`;
- the verified fixed contract must rank ahead of the unverified prize pool;
- deposit/token-approval, unestablished location, fabricated identity, and expired cases remain blocked and unranked.

These fixtures are deliberately deterministic. They do not claim to simulate the language model; they pin the policy-level analyzer and ranking outcomes that the skill documentation requires.

## Cross-harness audit

`tests/fixtures/mermail-bounty-ops/harness-compatibility.json` records the package evidence for the repository's supported Claude Code, Codex, Cursor, and OpenClaw surfaces. The validator checks every listed evidence path exists and keeps the safety invariants platform-independent.

## CI failure-mode dry run

`tests/fixtures/mermail-bounty-ops/ci-failure-modes.json` documents regression mutations that must be rejected, including a missing golden case, inverted verified-vs-unverified ranking, missing harness evidence, and accidental external effects in read-only triage.

Run `npm test` locally. The same validator is intended to fail closed when those contracts drift.
