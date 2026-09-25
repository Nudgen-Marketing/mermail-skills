# Subscription desk formats

## Renewal register

One row per recurring charge. Unknown values are written as `unknown`, never blank and never guessed.

| Vendor | Plan | Amount | Currency | Cadence | Next renewal | Cancel window | Trial end | Evidence email id | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| example-storage | annual team | 240 | USDC | yearly | 2026-10-14 | 14 days before | n/a | `<email-id>` | amount high · date high · window medium |

Field rules:

- `Amount` and `Currency` come from the same evidence line; do not convert or sum across currencies.
- `Next renewal` is taken from the commitment mail, not from the receipt date.
- `Cancel window` is `unknown` when the vendor states no notice period.
- `Confidence` is per field, so a strong amount does not hide a weak date.

## Charge watchlist

Rows inside the owner's horizon, ordered by days remaining.

| Days | Vendor | Next renewal | Cost | Cancel window | Action state | Blocking gap |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | example-storage | 2026-09-28 | 240 USDC | 14 days before | `watchlist_ready` | vendor notice period unknown |

## Owner summary

```
Status: watchlist_ready
Scope: <mailbox public_id> · horizon 14 days · all vendors
Rows: 6 detected · 4 inside horizon · 2 excluded as one-off
Evidence: 11 emails read · 1 attachment downloaded
Blocking gaps: 2 rows missing next renewal · 1 unreadable PDF
Anomalies: 1 duplicate receipt reconciled · 1 suspected impersonation reported
Next action: approve the cancellation draft for <vendor>, or confirm the missing renewal date
```

## Cancellation draft

```
Sender: <mailbox address>
Recipient: <vendor billing address, as printed in the commitment mail>
Subject: Cancellation request — <account reference, if the vendor states one>
Body:
- identify the account by the vendor's own reference, never by a card number
- request cancellation effective before the next renewal date
- ask for written confirmation and the final billing date
- request no further charges
Approval needed: exact body above, before any send
```

Keep one draft per vendor. Do not merge two vendors into one thread, and do not add payment instructions, card details, or links that the vendor did not send.
