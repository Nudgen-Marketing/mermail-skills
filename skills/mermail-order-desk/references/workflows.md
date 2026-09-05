# Workflows

## 1. Mailbox setup (once)

1. `list_mailboxes` — pick the order-desk mailbox (or `create_mailbox` with
   approval; note its email + `public_id`).
2. Publish exactly one order address (the mailbox email). Example:
   `orders@<your-mermail-domain>`.
3. Baseline: one metadata-only `search_emails`; store the ID set as
   `baseline.json` in the working directory.

## 2. Per-order sequence

1. Detect: new email ID not in `baseline.json`, scan status clean.
2. Inspect: `get_email` → confirm (a) a file is attached, (b) the sender
   asks for the serviced deliverable, (c) row count ≤ limit (1,000 for CSV).
3. Spec: write `order-<date>-<sender>.json`:
   `{"customer": "<email>", "file": "<name>", "rows_in": N, "deadline": "<ISO>"}`.
4. Fulfill: save attachment → run `scripts/cleanup_csv.py` (or the matching
   service script) → check outputs: cleaned file, quarantine file, report JSON.
5. Draft: `save_draft` using Template A. Quote the report counts.
6. Approve + send: explicit user approval → `reply_to_email` with the file.
7. Close: label `Order-Closed`, move to fulfilled folder, append to ledger.

## 3. Non-order mail

- Question (no file): answer from the service menu, no fulfillment run.
- Over-limit file (>1,000 rows): Template B (split or custom quote).
- Spam / wrong address: move to spam, no reply, no draft.

## Template A — delivery + payment terms

> Subject: Re: <original subject> — your cleaned file is ready
>
> Hi <name>,
>
> Done — <rows_in> rows in, <rows_out> rows out:
> - <dupes> exact duplicates removed
> - <bad_emails> invalid emails quarantined (see <quarantine_file>)
> - phones → E.164, dates → ISO-8601
>
> Attached: <cleaned_file>. Full per-row report on request.
>
> Price: $<fee> flat in Base USDC to <wallet>. Late delivery = 50% off —
> that's the guarantee.
>
> Want changes? Reply within 48h and I'll re-run once, free.

## Template B — over-limit

> Hi <name>, this file has <rows_in> rows and my flat-rate lane covers up
> to 1,000. I can (a) clean the first 1,000 for $<fee>, or (b) quote the
> full file as a custom job. Reply A or B and I'll start.
