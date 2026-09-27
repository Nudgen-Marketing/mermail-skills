# Bookkeeping workflows

Three sequences: initial build, incremental update, and monthly digest. All reads are bounded; the only internal write is a digest draft; every send is a separately approved external effect.

## 1. Initial ledger build

1. Resolve the receipts mailbox with `list_mailboxes` (one mailbox; ask if ambiguous).
2. Ask for the build window if the user did not name one (default: current month to date). Keep the window explicit in the run summary.
3. Discover candidates per sender/subject pattern batches, `metadata_only=true` first. Typical patterns: `receipt`, `invoice`, `your order`, `payment confirmed`, `subscription renewed`, known merchant billing domains.
4. `get_email` each candidate within the 60-read cap. Extract: payment date, merchant, amount, currency, kind (charge/refund), status (paid/pending/failed as stated), category (user's scheme or the default set: software, hardware, infra, services, travel, other), `email_id`, and `confidence`.
5. Normalize (see SKILL.md step 6), deduplicate by fingerprint, and emit the CSV plus totals, exclusions, and anomaly flags.
6. Deliver the CSV content in chat or save it as a draft attachment only when the user asked for a file; never auto-send.

## 2. Incremental update

1. Ask for the ledger state: prior rows by `email_id` (or re-run fingerprints if the user stores only the CSV).
2. Run the same bounded discovery over the named window (default: last 30 days).
3. Skip candidates whose `email_id` already has a row. Extract and normalize the rest.
4. Merge: new rows appended; duplicates merged into the existing row with a note; refunds matched against their original charge when the email references an order id, otherwise kept as `kind: refund`.
5. Recompute totals and flags over the merged set and emit the updated CSV plus a one-screen run summary (added/merged/excluded, window, caps, ambiguities).

## 3. Monthly digest draft

1. Confirm the period and the from-mailbox. Compute totals per category and merchant, top 5 merchants, refund offsets, and carry over open anomaly flags with their evidence.
2. `save_draft` from the resolved mailbox: string `body.body` content, a descriptive subject like `Spend digest — September 2026`, and no recipients beyond what the user named. If the user named no recipient, leave `to` unset and say so.
3. Present the exact draft content as the preview and stop. This is the default terminal state.
4. Only if the user then approves sending to exact recipients, call `send_email` with those recipients and the approved content. Anything else (forwarding, more recipients, changed window) is a new request, not an approval.

## Ledger row schema

| Field | Rule |
| --- | --- |
| `date` | Payment timestamp from the email (ISO-8601, UTC); received time only when no payment time exists, noted in `confidence`. |
| `merchant` | Legal or brand name as authenticated sender states it; never a parsed display name from an unauthenticated sender. |
| `amount` | Decimal as charged; no FX conversion, no invented tax splits. |
| `currency` | Code from the email (ISO-4217); symbol mapped to code only when unambiguous. |
| `kind` | `charge` or `refund`, as the email states. |
| `category` | User scheme or default set; `other` when unclear, never guessed from a subject line alone. |
| `status` | `paid` / `pending` / `failed` as stated; `unknown` when absent. |
| `confidence` | `high` (authenticated sender + explicit total), `medium` (amount parsed from body), `low` (unauthenticated sender or reconstructed total). |
| `email_id` | Mermail email id for dedupe and audit. |

## Anomaly flags

Flag only with quoted evidence, and never act on a flag (no emails, no disputes, no wallet calls):

- `duplicate`: same merchant + amount + currency within 14 days.
- `spike`: amount >= 2x the merchant's trailing median over >= 3 prior charges.
- `auth-mismatch`: charge attributed while `sender_authentication.status` is not `pass`.
- `currency-change`: first charge from this merchant in a different currency.
- `retry-risk`: same merchant + amount on consecutive days (possible double submission).
