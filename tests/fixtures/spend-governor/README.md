# Spend-governor reference set

`cases.mjs` is a golden reference set for the decision ladder in
`skills/mermail-spend-governor/references/workflows.md`. Each case pins a policy, a ledger state,
and one payment request, then asserts the exact decision word, remaining headroom, and reported
unknown fields that the ladder must produce.

It is a **policy-evaluator fixture set** — not an agent execution and not a payment simulator. It
never signs, pays, or reads a wallet; the evaluator under test is a pure function of
`(policy, ledger, request, now)`.

Run it through the repo's normal gate:

```sh
npm test          # node tests/validate.mjs
```

The harness fails when coverage drops, when a decision word loses its case, or when the ladder
itself changes behaviour. Two deliberate mutations were used to confirm the set is regression
sensitive:

```
# charge <= ceiling  ->  charge < ceiling   (boundary off-by-one)
ERROR: mermail-spend-governor: golden case ceiling-equals-charge-passes expected policy_ok,
  got needs_owner_approval (above the auto-approve ceiling)
ERROR: mermail-spend-governor: golden case per-request-cap-equal-passes expected policy_ok,
  got needs_owner_approval (above the auto-approve ceiling)

# duplicate gate disabled
ERROR: mermail-spend-governor: golden case duplicate-unresolved-entry-same-amount expected
  duplicate_suspected, got policy_ok (inside every gate)
ERROR: mermail-spend-governor: reference set does not cover decision duplicate_suspected
```

Coverage: `policy_ok`, `needs_owner_approval`, `policy_blocked_over_cap`, `policy_blocked_origin`,
`policy_blocked_asset`, `duplicate_suspected`, `policy_absent` — the harness also asserts that
coverage, so a decision word cannot silently lose its case.
