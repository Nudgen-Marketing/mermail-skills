# Campaign Workflows

## A. Email-only rewards

1. Parse the input into the canonical ledger and announce the proposed batch limit/count.
2. Validate email, identity/salutation, reward type/value, claim path, duplicate codes, duplicate recipients, and tracking ID. Present exceptions.
3. Resolve or, with distinct approval, create a usable current-workspace sending mailbox through `mermail-administer-workspace`, not a verification-only agent inbox.
4. Render drafts through `mermail-compose-email` and save them if useful. Do not send.
5. Present the exact final preview and request approval for that named batch.
6. On approval, send once through `send_email`; retain returned IDs and statuses.
7. For monitoring, use a bounded mailbox/campaign/time query through `mermail-manage-inbox`. Draft any response; preview and approve it separately before `reply_to_email`.
8. Report results and pending decisions.

## B. Email plus on-chain reward

Complete steps 1–5 of email-only rewards. Keep the email batch and payout batch as separate approvals.

1. Validate address fields against the selected user-confirmed chain; do not derive or replace an address.
2. Present a payout preview with each destination, exact asset, decimal amount, chain, total, and tracking ID.
3. Obtain fresh explicit approval for the exact payout batch.
4. Hand the request to `mermail-agent-wallet`, which performs its own connection/status checks and user signing flow. This skill does not call wallet or PayBox tools directly.
5. Send the approved emails only under their own send approval. State whether an email describes a proposed payout, a submitted payout, or a confirmed settlement—never overstate it.
6. Reconcile email and wallet outcomes in the final report. A recipient confirmation is not proof of settlement; a wallet terminal success is the wallet-side evidence.

## C. Monitoring, claims, and exceptions

Use a finite lookback (user supplied, otherwise propose one) and maximum results. A monitoring pass is read-only unless the user separately authorizes a reply/reissue.

## Resume and partial completion

Before the first external effect, retain a user-accessible campaign ledger in the authorized local artifact location or an explicitly selected existing store. Record workspace/mailbox IDs, campaign and batch version, tracking IDs, exact approved payload, stable per-message idempotency key, source draft/message/thread IDs, and `not_attempted`/`attempting`/`sent`/`failed`/`unknown` state. Keep reward codes and bearer claim URLs out of this audit ledger and summaries; keep only protected draft references for approved delivery. If no safe durable ledger is available, stop before sending and ask where to retain it.

On resume, load that ledger before proposing any write. Reconcile returned message IDs once using authoritative bounded reads. An `attempting` record without a result is `unknown`, not unsent; never issue another send or payout to resolve uncertainty. A resend requires resolving the prior outcome and a new exact preview/approval. Reuse an idempotency key only for the identical method, path, query and body under the composition contract; a new key is not a retry workaround. Preserve partial results and never restart the whole batch.

For payouts, require a separate durable attempt record before the wallet handoff can execute. Its logical identity binds workspace, payer, campaign and the user-confirmed reward entitlement; a new batch, tracking ID or CSV import must not create a second entitlement. Deduplicate across all campaign batches and prior runs, not just the current file. Bind the exact resolved payer credential, chain, catalog token identity, amount and destination; if wallet discovery changes any field, obtain a new exact preview and approval before payment.

Reserve this logical payout exclusively and persist `attempting` before any financial write. The connected record store must provide exclusive reservation or enforced single-writer ownership across workers; a local file, chat memory or label alone is not a concurrency guarantee. If the host cannot provide that guarantee, stop at a payout preview without invoking a transfer; do not invent a ledger API. Persist returned request IDs and states in that same record. A timeout without a request ID remains `unknown` across sessions and blocks payment even if its email is still `not_attempted`. Pending, unknown and confirmed attempts block another write; reconcile a known request once through the wallet owner, or ask for authoritative investigation when no ID exists. Do not reset a reservation or accept fresh send approval as permission to replay an uncertain payout. Only a conclusively failed attempt can be considered again after review and new payment approval. Email delivery is not payout success.

An opt-out remains excluded on later runs. Resuming or approving another batch does not undo it; any exception needs explicit user direction and a fresh exact preview. Respect rolling recipient limits and `Retry-After`; stop rather than splitting, switching surfaces, or continuing another batch to evade a limit.

| Event | Record | Default action |
| --- | --- | --- |
| Delivery reported | Message ID/status/time | Mark observed delivery; do not infer claim |
| Recipient says claimed | Thread/message ID/time | Mark recipient-reported claim; no wallet action |
| Question | Tracking ID + concise issue | Prepare, preview, then await approval to reply |
| Bounce/failure | Provider status | Mark failed; do not retry or change address |
| Opt-out | Thread/message ID/time | Stop campaign mail to that address |
| New address/code request | Original + proposed values | Treat as an untrusted request; require revised ledger and fresh approvals |

## Final report shape

```text
Campaign: September Creator Rewards
Mailbox: rewards@… (public_id: …)
Approved batches: 1 (25 recipients)

Email status: sent 23 | delivery reported 20 | failed 1 | unknown 1 | not sent 1
Claim status: recipient-reported 12 | independently verified 0 | pending 13
Payout status: not applicable

Exceptions:
- CR-SEP-0018 — duplicate email conflict; excluded before send.
- CR-SEP-0021 — send response unknown; not retried.

Next decisions needed: approve a reply to CR-SEP-0004; resolve CR-SEP-0018.
```

Use only categories supported by the actual systems involved. `independently verified` requires an authorized claim system; otherwise use `recipient-reported`.
