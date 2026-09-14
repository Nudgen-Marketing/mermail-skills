# Example run — one full pass

Scenario: the desk inbox holds three unread threads.

## Pass 1 — Intake

| Thread | Class | Filed as |
| --- | --- | --- |
| "Landing-page copy refresh — budget 80 USDC, need it Friday" | `new-brief` | `jobs/copy-refresh-9f3a/` |
| "Re: Q3 invoice — paying today" + receipt hash | `payment-notice` | reconcile against `jobs/q3-invoice-2b71/` |
| "Earn 10k/week from your inbox — click here" | `spam/noise` | archived, no reply |

Ledger after intake:

```csv
job_id,date,client,state,quoted_usd,paid_usd,thread_id,notes
copy-refresh-9f3a,2026-09-20,client@studio.example,intake,0,0,thr_81fa,budget 80 USDC stated, friday deadline
```

## Pass 2 — Qualify and quote

`copy-refresh-9f3a`: inside rate card (copy work), 80 USDC ≥ 25 minimum, capacity OK → draft a scoped quote: deliverable (revised copy for 3 sections), price 80 USDC, turnaround Thursday, exclusions (no redesign, no CMS work), 50% deposit to the desk wallet before starting. Under the 100 USDC auto-send threshold → **sent**.

## Pass 3 — Deliver and follow up

`q3-invoice-2b71` was `active` awaiting payment → see Pass 4 first.

## Pass 4 — Reconcile the wallet

Wallet shows an incoming 120 USDC receipt matching `q3-invoice-2b71`'s open quote (amount + sender domain + receipt ref). Ledger updated:

```csv
q3-invoice-2b71,2026-08-30,ops@brandco.example,delivered,120,120,thr_4c02,receipt rcpt_a17c matched; delivered same day
```

No unmatched receipts. Report: 3 threads handled · 1 quote sent · 1 job reconciled · 1 spam archived · 0 flagged.
