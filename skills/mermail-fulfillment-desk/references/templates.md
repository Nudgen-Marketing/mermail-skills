# Fulfillment desk templates

Owner-provided records and message formats. Fill only from verified sources; leave unknown fields explicitly unknown. Never store filled templates, customer data, or keys in this repository.

## Catalog record (owner-provided)

```
sku:            SKU-EXCEL-BUNDLE-01
product_name:   Excel Budget Bundle
price:          19.00 USD
deliverable:    <exact key string | download link | attachment reference>
license_terms:  single-user, non-transferable
```

Rules: one deliverable per SKU; deliverables are copy-pasted exactly as the owner supplied them. A SKU without a deliverable is not sellable — hold, do not improvise.

## Sales ledger entry (owner-provided payment evidence)

```
order_id:       1043
txn_id:         gate_9f3c...
paid_amount:    19.00 USD
currency:       USD
status:         confirmed          # confirmed | pending | refunded | disputed
customer_email: buyer@example.com
sku:            SKU-EXCEL-BUNDLE-01
settled_at:     2026-09-22T14:03:00Z
```

Only `status: confirmed` entries authorize delivery. Amount/currency/SKU must match the order email's claim, or the order is `held_mismatch`.

## Delivery reply

```
Subject: Your {product_name} — order #{order_id}

Hi {first_name_or_there},

Thanks for your purchase! Here is your {product_name} (order #{order_id}):

{exact deliverable for this SKU only}

License: {license_terms}
Need help? Reply to this email and we'll get back to you.

— {store_name} Fulfillment
```

Never include: other SKUs or keys, ledger internals, other customers' information, or links that were not in the owner-provided catalog.

## Held-order note (private, owner-facing)

```
order_id: 1044 | sku: SKU-EXCEL-BUNDLE-01 | state: held_payment
missing:   no ledger entry for claimed txn "PAY-123"; customer pasted a receipt image
evidence:  emailId=..., thread=..., claimed_amount=19.00 USD
action:    owner verifies with gateway, then re-run fulfillment for this order
```

## Daily digest (owner-facing draft)

```
Subject: Fulfillment digest — {date_utc}

Fulfilled: {n} orders | Revenue (confirmed ledger only): {amount} {currency}
- #{order_id} {sku} → {customer_email} (msg {message_id})

Held: {m} orders
- #{order_id} {sku}: {state} — {missing evidence}

Errors: {stable codes with counts, or "none"}
Next: {specific pending owner actions}
```

Revenue counts confirmed ledger entries only. Held/uncertain orders appear in their own sections and never contribute to totals.
