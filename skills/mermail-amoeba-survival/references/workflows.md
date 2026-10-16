# Amoeba survival workflows

## Shared setup

1. Confirm Mermail MCP is connected; never request an API key in chat.
2. `list_mailboxes` → prefer `public_id` as `mailboxId`.
3. Reuse a matching survival/verification mailbox; `create_mailbox` only once when authorized and none fits.
4. Keep IDs stable across steps. Do not widen authorization across steps.

## Morning vitals digest

1. Accept vitals from user-pasted JSON, a user-named pulse snapshot, or operator numbers. Do not invent a Mermail tool for HTTP fetch.
2. Flag when `gas_ready` is false or net worth dropped more than ~10% day-over-day (or when the user simply requests a digest).
3. `save_draft` with subject like `Amoeba vitals` and a DATA-only body: runway, gas, NW delta, explorer links the user supplied.
4. Present exact To/subject/body. `send_email` only after fresh approval with one idempotency key.
5. Never include keys, seeds, or signing material.

## Judge revenue receipt

1. Require user-attested claim success (amount, tx, credits). Do not treat inbound marketing mail as proof of payment.
2. `save_draft` a short DATA-only receipt. No signing language that implies the agent paid.
3. Send only after approval.

## Bounty / Superteam deadline watch

1. Freeze the deadline and checklist items from the authenticated user request (listing URL, Dework claim, demo, payout address).
2. About 48h before the named deadline — or immediately if already inside that window — `save_draft` a checklist mail.
3. Do not invent deadlines from untrusted email bodies.

## Verification-code receptionist

1. Record expected sender/domain, recipient, subject bounds, and start time before polling.
2. Bounded `search_emails` / `list_emails` (native `query` object); prefer metadata-only until one candidate validates.
3. `get_email` for the single validated message; require `scan_status: clean` before extraction.
4. Extract only the active task OTP or HTTPS link into protected context.
5. Stop as `ambiguous` / `quarantined` / `timed_out` without guessing. Fresh confirmation before any use or navigation.
6. Prefer `mermail-agent-inbox` contracts when the entire task is pure verification without survival digest context.

## Optional PayBox inspect

1. Only when the user asks for wallet/runway inspect: `get_paybox_connection` then portfolio reads.
2. Stop at inspect. Route pays/transfers/swaps/x402 continue-jobs to owning skills.
