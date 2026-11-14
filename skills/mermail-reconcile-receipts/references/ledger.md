# Ledger input and arithmetic

`scripts/reconcile.mjs` accepts UTF-8 JSON with `schema_version: 1`, `scope`, and
`events`. Run it with Node.js 22+ and no installed packages. Omit `--markdown`
for structured JSON output. Redirect stdout to save a report. Input is capped at
2 MiB and 500 records. It does not connect to Mermail or parse raw email; the
agent extracts evidence from authorized MCP reads first.

```json
{
  "schema_version": 1,
  "scope": {
    "mailbox_id": "actual-public-id",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-30T23:59:59Z",
    "coverage": "Four search pages; 12 bodies inspected; one omitted."
  },
  "events": [{
    "email_id": "actual-email-id",
    "document_id": "INV-42",
    "merchant_id": "billing.example",
    "invoice_id": "INV-42",
    "event_type": "invoice",
    "currency": "USD",
    "amount": "100.00",
    "scan_status": "clean",
    "sender_authentication": "pass",
    "status": "confirmed",
    "evidence": "Invoice INV-42 total USD 100.00"
  }]
}
```

All string fields are bounded. `scope` requires the four illustrated fields.
`date_start` and `date_end` are RFC3339 timestamps including timezone; start must
precede end. `coverage` records the actual queries, pagination, omissions, and
truncation. Input does not claim exhaustive coverage.

Each event requires every illustrated field. `event_type` is `invoice`,
`payment_receipt`, `credit_note`, or `refund`. `status` is `confirmed`, `pending`,
or `cancelled`; confirmed means the document reports the event as completed,
not that the agent verified settlement. Copy structured scan/authentication
results exactly. Use an empty `invoice_id` or `document_id` for a missing
reference (whitespace-only references are also missing); the helper puts that record in review. Use `amount: null` for an
ambiguous amount and `currency: null` for an ambiguous currency.

Amounts are nonnegative decimal **strings**, with at most 18 integer and 6
fractional digits. Reject floats, exponent notation, symbols, separators, and
negative amounts instead of guessing. Refunds and credits use positive amounts;
their event type determines the sign. Currency codes are exact uppercase
alphanumeric strings of 3–10 characters. No currency conversion is performed.

For an invoice event, `document_id` must equal `invoice_id`. For a receipt,
credit, or refund, `document_id` is that event's own stable issuer reference.
Distinct partial receipts need distinct IDs. An email ID is not a substitute for
a document ID. A forwarded copy must retain its original document ID. Use a
merchant mapping only when the user confirmed the relationship; never normalize
different sellers together just because a shared payment processor sent mail.

Eligibility for arithmetic requires a clean scan, passed sender authentication,
confirmed event, explicit IDs, and unambiguous amount/currency. Other records
stay in `review`. Among eligible records, identical `(merchant_id, event_type,
document_id)` entries count once and retain all source IDs. If their currency,
amount, or invoice target differs, all copies are excluded as a document conflict,
and affected invoice rows are marked `review_required`.

Group remaining records by exact `(merchant_id, invoice_id, currency)`. A group
with no invoice is unlinked evidence, not income or a zero-balance invoice.

```text
reported_balance = invoice - credit_notes - payment_receipts + refunds
```

A positive balance is an outstanding amount **reported by the inspected
evidence**. A negative balance is reported overpayment/credit. Zero is balanced
within the inspected evidence. If any excluded record targets the same invoice
or a document conflict exists, show `review_required` even when the arithmetic
balances. The helper retains subtotals and exact source IDs for investigation.
Currency totals separate outstanding and credit amounts and exclude rows that
need review. This is bookkeeping assistance, not payment authorization or
financial, tax, or legal advice.
