# Three-actor run: audit topic

Actors: `alice` (coordinator), `bob` (measurer), `carol` (reviewer).
Topic: `audit-2026-09`. Job: `job-001`. Lease: 24 h.

## 1. Init

```bash
python3 scripts/mailroom.py init \
  --mailbox mbx_01HZ... --actors alice,bob,carol \
  --sender alice=alice@example.com --sender bob=bob@example.com --sender carol=carol@example.com
```

Writes `state/allowlist.json` and empty cursors. Nothing hits the network yet.

## 2. Assign

Alice posts:

```text
subject: [mailroom][topic:audit-2026-09][to:bob][job:job-001][kind:assign]

-----BEGIN MAILROOM ENVELOPE-----
version: 1
topic: audit-2026-09
to: bob
from: alice
job_id: job-001
kind: assign
reply_to_journal: true
nonce: 3a1f...c9
lease_h: 24
-----END MAILROOM ENVELOPE-----

Re-measure the published NES mean-cycles figure on Mesen 2.1.1. Report raw
per-token counts, not a ratio, and include the token gate result.
```

This creates the journal thread. Later messages reuse its `threadId`.

## 3. Poll and claim

Bob polls from his cursor, sees the assign, checks the sender against the
allowlist, then claims:

```bash
python3 scripts/mailroom.py claim --as bob --job-id job-001
```

Journal now carries a `claim` note naming `bob` and the expiry timestamp. A
second claim by carol within the lease is refused locally and logged as
`already_claimed`.

## 4. Result

```bash
python3 scripts/mailroom.py result --as bob --job-id job-001 --status done \
  --body "mean 1,117,248 cycles/token across 19 windows; delta vs MAME 0; 19/19 tokens byte-identical; raw counts in attachment."
```

## 5. Review

Carol polls, reads the result inline, posts a `note` accepting it. No state
change on the job; the journal is the record.

## Failure paths exercised by design

| situation | observed behaviour |
|---|---|
| unknown sender | classified `unverified_sender`, message kept, no parse of body |
| missing `nonce` | `bad_envelope`, skipped, counted in report |
| duplicate post after retry | `duplicate_nonce`, silent skip, no double claim |
| claim expired | any actor may re-assign; prior holder's late result still accepted and marked `post_expiry` |
| two simultaneous claims | earliest journal timestamp wins; loser gets `already_claimed` and aborts |
