# Invoice Chaser — Workflow Sequences

## W1 · Initial ledger build

1. `list_mailboxes` → resolve one mailbox (`public_id`).
2. `search_emails` — terms: `invoice`, `amount due`, `payment terms`, `past due`, `remittance` over user-named window (default 60d).
3. Parse each hit into candidate rows; flag ambiguous ones `NEEDS-REVIEW`.
4. Render the candidate table to the user. On confirm, write `ar_ledger.md` (or update existing).
5. Report totals by status.

## W2 · Scheduled collections pass

1. Re-run the W1 search narrowed to `since last run`.
2. Search payment confirmations: `payment received`, `remittance advice`, `wire confirmation`, `transfer of <amount> USDC`.
3. Match confirmations to OPEN entries (customer + amount ± tolerance). Mark `PAID-CANDIDATE`; never auto-close.
4. Compute days-overdue per OPEN/PROMISED entry. Select ladder stage per entry (see SKILL.md).
5. Group per customer; draft one message per customer at that customer's highest applicable stage.
6. If PayBox active (`get_paybox_connection` → ACTIVE): prepare `paybox_request_payment` terms per invoice; show terms; embed link only on approval.
7. Render all drafts. Collect approvals per draft (or explicit per-batch approval after all drafts shown). Send approved drafts via `send_email`; update rows.

## W3 · Promise handling

Customer reply with a date ("paying Friday", "on the 15th") → set `PROMISED`, store date, pause ladder. If date lapses without a confirmation match → re-open at the next stage (not stage 1).

## W4 · Reconciliation close

Entry closes on either: (a) user confirms payment ("mark INV-x paid") → `PAID`; or (b) PayBox terminal success for the bound payment request → propose `PAID` to user with the transaction reference. Manual write-off (`WRITEOFF`) is destructive → `prepare_destructive_action`.

## Ladder copy skeleton (edit per user voice)

- **Stage 1**: subject `Invoice {id} — due {date}`; body: friendly recap, link, thanks.
- **Stage 2**: subject `Invoice {id} — {n} days past due`; body: amount + terms recap, link, request a payment date.
- **Stage 3**: subject `Final notice — invoice {id}`; body: amount, deadline date, consequence per user policy, link.

One message per customer per run; highest stage wins when several invoices are overdue.
