# Executive digest agent workflows

## Mailbox discovery

1. Call `list_mailboxes`. Prefer a ready receiving inbox with automations allowed.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Use the mailbox email address and `public_id` as stable identifiers.

## Bounded notification triage

1. Discover candidates with a bounded `search_emails` or `list_emails` (metadata first).
2. Use focused financial query keywords (`deposit`, `payout`, `transfer`, `invoice`, `reward`).
3. Call `get_email` only for unambiguous candidate messages with `scan_status: clean`.
4. Parse transaction amount, currency/token symbol, tx hash/reference, and timestamp.

## Digest compilation & draft generation

1. Aggregate totals across extracted assets.
2. Format into the canonical markdown table structure defined in [digest-template.md](digest-template.md).
3. Call `save_draft` with the digest markdown as `body.body`.
4. Present summary statistics to the user for human review.
