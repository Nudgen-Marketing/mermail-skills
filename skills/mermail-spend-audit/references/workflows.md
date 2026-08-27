# Workflows

## Main sweep (default)

```
1. list_mailboxes                      → pick target mailbox (ask if >1 and unclear)
2. search_emails  (query set A)        → collect candidates in window
3. for each candidate:
     get_email                         → extract vendor/amount/currency/date/proof_id
4. get_paybox_connection               → probe ONCE (ACTIVE or inventory-only mode)
5. group receipts by proof_id          → reconcile vs PayBox records
6. apply anomaly rules                 → flag list
7. render report → save_draft          → "[spend-audit] YYYY-MM"
8. print inline summary table
```

Query set A (run all, merge by message id):

```
subject:(receipt OR invoice OR "payment received" OR "order confirmed")
"x402"
"your payment"
"total charged"
```

## Anomaly rules

| Flag | Condition |
| --- | --- |
| `DUPLICATE` | Same vendor + same amount within 48h, both marked paid |
| `AMOUNT_DRIFT` | Recurring charge differs from previous period by >10% |
| `NO_PROOF` | Receipt email exists, no matching PayBox proof record |
| `ORPHAN_PROOF` | PayBox proof settled, no receipt email found |
| `AMOUNT_MISMATCH` | Receipt amount ≠ proof-recorded amount |
| `UNSETTLED` | Proof status pending / SUBMISSION_UNKNOWN |
| `CURRENCY_MIX` | Charge currency differs from workspace default |
| `UNKNOWN_VENDOR` | Vendor not seen in prior audits and not user-allowlisted |

## Report shape

```markdown
# Spend Audit — YYYY-MM
Scope: <mailbox> · window: <dates> · items: N · verified: M

## Totals
- total spend: X.XX USD-equiv
- by vendor: top 5 table

## Flags
| flag | vendor | amount | detail |

## Items
| date | vendor | amount | proof | verdict |

## Unverified (inventory-only mode ran: yes/no)
```

## Edge cases

- **Multiple mailboxes:** audit each, one report section per mailbox; ask only when the
  window's charges span mailboxes with different owners.
- **Non-English receipts:** still parse; keep original subject in the item row.
- **Very large windows (>500 hits):** paginate `search_emails`, summarize by vendor first,
  offer drill-down per vendor instead of dumping every item.
- **Draft already exists for this month:** replace content of the existing draft rather
  than stacking duplicates.

## Scheduled operation

Run monthly (or weekly) via host cron. The skill is deterministic and read-only apart from
the single draft write, so unattended runs are safe. Keep the last 12 reports searchable —
they double as the vendor history that powers `UNKNOWN_VENDOR` and `AMOUNT_DRIFT`.
