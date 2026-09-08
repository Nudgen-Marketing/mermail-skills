# Comparison contract

The optional `scripts/review.mjs` compares already extracted records deterministically. It does not connect to Mermail, authenticate a sender, parse invoices, verify payment status, or detect every kind of fraud. Its input must come from the bounded live workflow, or be clearly labeled synthetic test data.

Input is an object with `records` and optional `baselines`. Each record has:

```json
{"emailId":"message-id","vendorId":"user-mapped-vendor","invoiceId":"INV-41","amount":"100.00","currency":"USDC","network":"solana","destination":"exact-destination","scanStatus":"clean","senderAuth":"pass","contentComplete":true}
```

Missing fields become unresolved evidence. A baseline has `vendorId`, `network`, `destination`, and `confirmedByUser: true`. The last flag describes independently obtained confirmation; never manufacture it from invoice language. More than one confirmed baseline for a vendor is ambiguous.

Run with Node.js 22+:

```text
node skills/mermail-invoice-review/scripts/review.mjs evidence.json
node --test skills/mermail-invoice-review/scripts/review.test.mjs
```

The helper accepts decimal strings with a dot, at most 18 fractional places, no thousands separators, no exponent, and no sign. This avoids floating-point rounding or guessing locale-specific amounts. A USD request and a USDC request remain distinct. Invoice IDs retain case and punctuation; surrounding whitespace is ignored. A repeated identical email ID is processed once; conflicting copies of that ID raise an input error.

Outputs preserve source email IDs, original amount/currency, finding codes, and masked destination suffixes. They do not expose full destinations or suggest a payable total. The caller must add actual search coverage, time window, field provenance, and unreadable-source information to the final report; the helper cannot infer completeness from extracted JSON alone.
