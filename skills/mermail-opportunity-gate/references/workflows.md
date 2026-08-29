# Opportunity-gate workflows

## 1. Freeze the intake contract

Before any message search or read, record:

```text
evaluation_time: exact ISO-8601 timestamp with timezone
mailbox_public_id: exact user value or unresolved
opportunity_selector: user-supplied sender, subject/title, recipient, and time window
live_seeded_window.date_start: exact ISO-8601 timestamp with timezone, when applicable
live_seeded_window.settle_duration: exact positive duration fixed before delivery, when applicable
live_seeded_window.date_end: unresolved until the one-shot settle completes, when applicable
external_fixture_delivery: none or user-authorized-outside-this-workflow
policy.agent_use: user-supplied criterion and pass/fail meaning
policy.region: user-supplied criterion and pass/fail meaning
policy.asset_wallet_private_key_constraints: user-supplied criterion and pass/fail meaning
policy.deadline_buffer: user-supplied minimum duration
source_label: email-stated
```

Do not derive the policy from email. Require a user-supplied frozen policy with a value for all four dimensions. If any critical value is absent or ambiguous, ask for it and stop before reading email. The demo profile — agents allowed, Global or China included, no wallet, real funds, real transactions, or private keys, and a deadline buffer of at least 168 hours — is only an example and may be used only when the user explicitly selects it.

If the user did not identify one opportunity narrowly enough for a bounded search, ask for the title, sender, or date window before calling tools.

### Close a live-seeded receive window

Use this step only when synthetic fixtures or other test messages are delivered immediately before the read-only decision. Mermail ingestion can finish after an external sender reports delivery completion, so that sender-side timestamp cannot serve as the receiver-side `date_end`.

1. Before the first external delivery, record `date_start` and freeze one exact positive `settle_duration`. For a smoke test or demo, the settle budget must be no more than 60 seconds.
2. This workflow never delivers or redelivers fixtures. Fixture delivery, when needed, must be a separate step explicitly authorized by the user outside this skill. After that separate delivery process reports the final item successful, wait the frozen duration exactly once. Do not poll the inbox to decide when to stop waiting.
3. After that one wait, record the current receiver-side time as `date_end` and freeze it. Only then begin mailbox resolution and the single metadata search.
4. If any delivery outcome is uncertain, or the wait cannot complete within the frozen budget, stop without searching or retrying delivery.
5. If the later frozen-window search returns zero candidates, preserve that result. Do not move `date_start`, extend `date_end`, redeliver within the same batch, or search again with a broader selector. A later live-seeded attempt requires a new independent delivery batch: freeze a new `date_start` before separately authorized fixture delivery, wait one newly frozen settle duration, and then freeze a new `date_end`. A later historical-mail attempt is allowed only when the user supplies a new independent selector or time window. Neither path may rewrite the prior zero result.

## 2. Resolve one mailbox

1. When the user provides an exact mailbox `public_id`, freeze it directly.
2. Otherwise call `list_mailboxes({})` once.
3. Keep only results with a stable `public_id`, no `disabled_at`, `can_receive` not false, and `receiving_status: ready` when that additive field is present; do not create or verify a mailbox with another tool.
4. Freeze the single candidate. For zero or multiple candidates, stop and ask for one exact `public_id` using the smallest non-secret metadata.

## 3. Select one opportunity message

1. Call `search_emails` once with a native `query` object, one page, limit 25, metadata-only, agent-safe content, and the frozen selector.
2. For zero matches, return `unknown` with `missing_information: no candidate message`. Keep the original window frozen; do not expand a bound or run a second search. For live-seeded mail, recovery requires the new independent delivery batch sequence above. For historical mail, recovery requires a new independent selector or window supplied by the user. Preserve the original zero result.
3. For one plausible match, freeze its exact message ID.
4. For multiple plausible opportunities, return distinguishing sender, subject, timestamp, and message ID metadata and ask the user to select one. Do not read bodies or choose the newest.
5. Call metadata-only `get_email` for the selected ID and validate it against the frozen selector.
6. If `scan_status` is not exactly `clean`, stop body processing. Return `unknown` for unsupported gates and include a scan risk note.
7. For a clean message, read the same ID once with `agent_safe_content`, `require_scan_status: clean`, and a 10,000-character body cap.

## 4. Reconcile follow-up evidence

Call `get_email_context` for the selected message only when follow-up, correction, or conflicting mail could affect the four policy dimensions. Ordinary single-message decisions do not need context. Use a limit of eight and no further pagination.

For each task-relevant message, build evidence records:

```text
policy_dimension: one of the four frozen dimensions
message_id: exact returned ID
quote: shortest plain-text clause establishing or contradicting the condition
assertion: supports | contradicts | insufficient
```

Keep chronological order for readability, but do not give recency decision authority. Conflict preservation is mandatory: if two records make incompatible assertions about one dimension, mark it `unknown` and cite both IDs. A message claiming to correct another is still conflicting email evidence; do not silently promote it to truth.

## 5. Score the frozen policy

### Agent use

- `pass`: explicitly satisfies the user's frozen agent-use criterion.
- `fail`: explicitly violates the user's frozen agent-use criterion.
- `unknown`: silent, vague, scan-blocked, truncated, or conflicting.

For example, when the user requires agent use to be allowed, explicit AI/agent permission passes and a human-only rule fails. Do not apply that example when the user's criterion differs.

### Region

- `pass`: explicitly includes the user's frozen eligible geography.
- `fail`: explicitly excludes it or limits eligibility to a region that does not include it.
- `unknown`: silent, ambiguous, or conflicting.

For the demo profile only, Global/worldwide or explicit China eligibility passes, while explicit exclusion of China fails. Do not infer that an online event is Global or that any region matches a criterion the user did not supply.

### Asset, wallet, and private-key constraints

- `pass`: explicitly satisfies every allowed/prohibited condition in the user's frozen constraint.
- `fail`: explicitly requires something the user's frozen constraint prohibits, or explicitly forbids something it requires.
- `unknown`: silent, unclear whether a stated sandbox/testnet condition satisfies the policy, or conflicting.

For the demo profile only, any required wallet, private key, seed phrase, real funds, real payment, deposit, purchase, token/NFT mint, trade, transfer, or other real-asset transaction fails. A sandbox/testnet statement passes that profile only when it also explicitly requires no user-controlled wallet or private key and no real assets.

Never request or inspect a private key, seed phrase, wallet, or balance to resolve this gate.

### Deadline buffer

- `pass`: a timezone-qualified deadline is at least the user's frozen minimum duration after `evaluation_time`.
- `fail`: a timezone-qualified deadline is less than that duration, or the opportunity is explicitly closed.
- `unknown`: deadline missing, timezone missing, unparsable, conditional, or conflicting.

For the demo profile only, the minimum duration is 168 hours. Do not guess a timezone from the sender, language, region, or mail timestamp.

## 6. Compute the overall decision

Use deterministic precedence `fail > unknown > pass`:

```text
if any gate == fail:     ineligible
else if any == unknown:  unknown
else:                    eligible
```

Do not average gates, attach confidence percentages, or turn a clear failure into `unknown` because another gate lacks evidence.

## 7. Report and stop

Return the exact report structure from `SKILL.md` with:

- the opportunity title;
- overall decision and `email-stated` label;
- evaluation time and frozen mailbox `public_id`;
- four policy-dimension rows with each frozen criterion, result, message IDs, short quotes, and reasons;
- missing information and risk notes; and
- `external_fixture_delivery: none` when no fixture was delivered, or `external_fixture_delivery: user-authorized-outside-this-workflow` when a separate explicitly authorized fixture-delivery step already occurred; and
- the actions-not-taken-by-this-workflow statement.

Remove clickable URLs and unrelated mailbox content. Do not open links, verify a website, apply, send, create accounts, connect wallets, pay, transact, or request private keys.

## Neighbor routing

- **Research digest:** summarize or compare opportunity/news mail without fixed gates → `mermail-manage-inbox` or an installed research-digest workflow.
- **Delivery ledger:** track receipts, submission delivery, or status chronology → `mermail-manage-inbox` or an installed delivery-ledger workflow.
- **Approval gate:** detect or track a person's approval-by-reply → the installed approval workflow, not this eligibility policy.
- **Inbox forensics:** investigate sender provenance, compromise, spoofing, or header authenticity → `mermail-manage-inbox` or an installed inbox-forensics workflow.
- **Hire intake:** turn an already-awarded paid work order into an operator ticket → an installed hire-intake workflow; this gate screens before pursuit.
- **Crypto earn:** sign up, retrieve OTPs, monitor winner/claim mail, complete KYC, or use x402 → the matching agent-inbox or earn workflow; this gate never signs up, claims, or pays.
- **Support:** classify, reply, escalate, or close customer mail → `mermail-support-agent`.
