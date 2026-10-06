# Extraction and deterministic calculation

Pass a JSON array of extracted document records to the optional Node.js 22+ helper. It makes no network requests, installs no packages, and emits only stdout. An actual Mermail read is still needed before extracting real records.

```json
{
  "email_id": "tool-returned-email-id",
  "merchant": "explicit merchant",
  "invoice_id": "explicit document ID or null",
  "document_date": "2026-09-10",
  "currency": "MYR",
  "amount": "19.90",
  "kind": "receipt",
  "status": "paid",
  "scan_status": "clean",
  "content_omitted": false,
  "truncated": false,
  "sender_authentication": "pass",
  "evidence": {
    "amount": "Total: MYR 19.90",
    "currency": "Total: MYR 19.90",
    "status": "Payment received",
    "invoice_id": "Receipt DEMO-1"
  }
}
```

`kind` is `receipt`, `invoice`, or `refund`. `status` is `paid`, `due`, `refunded`, or `unknown`. Only invoice+due, receipt/invoice+paid, and refund+refunded enter their corresponding totals. Unknown/missing evidence, unsafe scans, failed/missing authentication, and unsupported precision go to review and are excluded. Explicit `sender_authentication: "unknown"` keeps the origin unresolved: its email-stated amounts may appear only in separate `unverified_totals`, with per-row origin confidence and review warnings. Never promote unknown to pass or merge these totals with authenticated-sender claims. Even an authenticated sender is not bank verification. `document_date` may be null but is flagged; never replace it with received date. Invoice IDs are optional but without one automatic deduplication is disabled. Keep date-range and tool-call coverage in the agent's report, outside this calculator's claims.

Amounts are nonnegative decimal strings without commas or exponent notation. Use absolute completed refund amounts; the calculator subtracts refunds. Explicit supported codes: USD, EUR, GBP, MYR, SGD, AUD, CAD (2 decimals), JPY/KRW (0), BHD/KWD (3), USDC (6). Unsupported codes are reviewable, not assumed to have two decimals. No FX conversion. Integer minor units avoid rounding drift. Currency totals do not assert bank settlement.

From the repository root:

```sh
node skills/mermail-receipt-review/scripts/receipt-ledger.mjs < extracted-records.json
node skills/mermail-receipt-review/scripts/receipt-ledger.mjs --csv < extracted-records.json
node --test tests/receipt-review.test.mjs
```

Export stdout to a file only when the user requested a private destination. The CSV includes accepted ledger rows; review reasons and duplicate/conflict evidence remain in the JSON report and must accompany any user-facing CSV handoff. Formula-leading text is prefixed with an apostrophe, then quoted with escaped double quotes. The helper validates structure and arithmetic, not the truth or completeness of AI extraction.
