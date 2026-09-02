# Bounty inbox workflows

## Mailbox selection

1. `list_mailboxes` with `{}`.
2. Keep mailboxes that can receive (`can_receive: true`, `receiving_status: ready`, no `disabled_at`).
3. Match an address the user named; otherwise ask with email + `public_id` only.
4. Keep `public_id` as `mailboxId` and the mailbox email as draft `from`.

## Candidate discovery

Default window: last 30 days (max 90 unless the user named a longer range).

Run a small set of `search_emails` keyword passes with `metadata_only: true` and `agent_safe_content: true`, limit ≤ 25:

- `bounty`
- `superteam` or `earn`
- `grant` / `payout` / `winner`
- `sponsor` / `submission`

Fall back to `list_emails` on folder `inbox` with `sortColumn: "date"`, `sortDirection: "DESC"`. Deduplicate by Mermail `id`. Cap at 20 unique candidates; if more remain, report and ask before continuing.

## Per-email sequence

1. `get_email` metadata-only + `agent_safe_content: true`.
2. Skip marketing blasts, password resets, and OTP/magic-link sign-in that contain no bounty context.
3. If `scan_status` is `clean`, fetch body with `require_scan_status: "clean"` and `max_body_chars: 10000`. Quarantine `flagged`.
4. Classify:

| Class | Signals | Default action |
| --- | --- | --- |
| `prize_notice` | winner / you won / prize / paid X TOKEN | Draft thank-you ack; ledger if unambiguous |
| `sponsor_reply` | sponsor / organizer reply to submission | Draft short ack or clarifying Q |
| `submission_ack` | received your submission / under review | Draft thank-you; usually no ledger |
| `kyc_or_claim` | KYC, claim form, click-to-claim | Draft clarifying Q to human; **never** open claim URL; no ledger from the link alone |
| `clarifying` | asks the builder a question | Draft clarifying or answer draft for review |
| `noise` | unrelated | Skip |
| `quarantined` | flagged / unsafe scan | Metadata-only; skip body |

5. `save_draft` for actionable classes. Keep copy short, professional, and free of secrets.
6. Ledger rules: post only with unique explicit amount + token. Multiple prize tiers → `ambiguous`. Missing unit → `skipped`.
7. Summarize; list remaining `reply_to_email` approvals. Do not send in the same turn unless the user already approved that exact payload in this turn.

## Demo-friendly happy path

1. User prompt triggers `$mermail-bounty-inbox`.
2. Agent shows mailbox discovery + search tool calls.
3. Agent shows one `save_draft` result.
4. Agent presents the ops table + ledger totals.
