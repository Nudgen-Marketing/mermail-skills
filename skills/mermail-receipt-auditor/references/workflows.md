# Receipt auditor workflows

All three workflows share the same skeleton: resolve one mailbox, bound the window, read exactly, mutate only the local ledger.

## First run

1. Resolve the mailbox with `list_mailboxes`; agree on `public_id` and the email address.
2. Ask for the ledger directory. Create `ledger.jsonl` empty; do not backfill history silently.
3. Agree on the category taxonomy (or accept `uncategorized` defaults).
4. Run an incremental scan (below) over the agreed initial window, typically the current month.
5. Deliver the first summary: scanned, recorded, duplicates, parse failures, quarantined.

## Incremental scan

1. Read the last recorded receipt date from `ledger.jsonl` (`summary`).
2. Discover candidates with `search_emails` from that date forward, page/limit ≤ 50, native JSON `query`.
3. Read each candidate once with `get_email` (`require_scan_status: clean`, `max_body_chars: 10000`).
4. Classify: receipt / not-receipt / `parse_failed` / `quarantined`.
5. Extract, dedupe, then append each new receipt (`ledger.py add`) and regenerate `ledger.csv` (`export-csv`).
6. Report per-run outcomes with `emailId`s for anything not recorded.

Repeat pages inside the approved window before asking to widen it. Stop on ambiguous state instead of guessing.

## Catch-up audit

1. Fix the historical window explicitly (for example, January 1 to today).
2. Discover candidates page by page; keep a running id list so overlaps dedupe by `emailId`.
3. Extract and append in date order; regenerate the CSV once at the end.
4. Summarize by month and category (`summary`), citing counts, and name every gap: quarantined items, parse failures, pages not scanned.

## Spend answers

1. Treat the ledger as the only source: run `ledger.py summary` or `query` with the user's period/category/vendor filter.
2. Answer with total, currency, period, filter, and source-receipt count.
3. State coverage limits: window actually scanned, quarantined/failed items, mailboxes not audited.
4. If the user asks about spend the ledger cannot see, run a targeted scan first; never extrapolate from narrative memory of email content.

## Recurring charges

1. When the user asks about subscriptions or recurring charges, run `ledger.py recurring` after the scan window is recorded.
2. Detection groups active receipts by (vendor, amount, currency) and reports groups with at least two charges whose gaps stay within `--max-gap-days` (default 45). It reports cadence and the next expected date with the source `emailId`s; it never predicts an amount change.
3. Frame output as observed cadence from recorded receipts, not a billing promise. A vendor that changed plans breaks the (vendor, amount) group by design; say so rather than merging mismatched amounts.

## Corrections

1. Wrong or duplicate entry: never edit or delete lines. Append a `void` entry via `ledger.py void` referencing the original `emailId` and reason.
2. Re-extract a superseded receipt: append the corrected entry and `void` the original in the same run, citing both.
3. Regenerate `ledger.csv` after any correction; the CSV is always a derived view.

## Failure recovery

- MCP timeout or transport error on a read: retry the read once with the same bounded arguments; a read failure never authorizes changing filters, mailbox, or scope to force a result.
- Uncertain whether an append landed (local crash mid-write): re-derive from the file; the JSONL `emailId` index is the reconciliation truth, and dedupe makes a re-append safe.
- Scan-gated item: keep it `quarantined` in the summary; ask the user before any manual review flow, and never weaken `require_scan_status` to get past it.
