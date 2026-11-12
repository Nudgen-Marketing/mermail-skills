# Evidence and exact arithmetic

## Classify before calculating

| Event | What it supports | What it does not establish |
| --- | --- | --- |
| Order failed/cancelled | Reported order outcome | Whether a charge settled or a refund occurred |
| Authorization release | Claim that a payment hold was released | A refund of a captured charge |
| Refund promised | An explicit expected amount | Processing or bank receipt |
| Refund processed notice | Provider's claim about one referenced refund | Independent settlement in the buyer's account |
| Repeated or quoted notice | Additional mention of an existing reference | A second refund |
| Reversal or conflicting reference amount | Evidence requiring review | A safe total or silently corrected balance |

Future wording such as "we will process" or "requested a refund" is a promise, not a processing notice. Never sum promises and notices. Keep a refund without a processor reference visible as unresolved; do not assume two similar no-reference messages represent either one or two refunds.

Use one currency. Refund expectation must be user-supplied or explicitly supported by a promise, with source provenance in the report. Report over-explained amounts as a discrepancy, not additional earnings. Sender authentication supports attribution only, not the factual truth of an email.

## Local packet

The helper accepts this normalized analysis format, **not a raw Mermail response**. Construct it from sanitized tool results and the user's scope; never label it server-attested data.

```json
{
  "schema_version": 1,
  "scope": {
    "mailbox_id": "demo-mailbox",
    "merchant_sender": "receipts@example.com",
    "order_id": "DEMO-REFUND-1042",
    "currency": "USD",
    "expected_refund": "120.00",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-15T23:59:59Z",
    "as_of": "2026-09-15T12:00:00Z"
  },
  "coverage": {
    "complete": false,
    "note": "Only the selected demonstration message was supplied."
  },
  "sources": [
    {
      "email_id": "demo-email-2",
      "mailbox_id": "demo-mailbox",
      "from": "receipts@example.com",
      "date": "2026-09-12T09:00:00Z",
      "scan_status": "clean",
      "sender_authentication": {"status": "pass"},
      "content_omitted": false,
      "content_truncated": false,
      "text": "Order DEMO-REFUND-1042: we processed USD 45.00 under refund reference DEMO-R1."
    }
  ],
  "observations": [
    {
      "email_id": "demo-email-2",
      "kind": "processed",
      "amount": "45.00",
      "currency": "USD",
      "refund_id": "DEMO-R1",
      "quote": "Order DEMO-REFUND-1042: we processed USD 45.00 under refund reference DEMO-R1."
    }
  ]
}
```

This example is a **synthetic fixture**. Its scan/authentication verdicts are supplied test inputs. A live packet must preserve actual verdicts; unknown or missing authentication must not be upgraded. Copy plain-text content from the returned sanitized representation; do not decode or fetch raw email to circumvent content omission.

Normalize a selected Mermail response as follows, retaining the original tool result privately for comparison:

- Map `id` to `email_id`, the selected mailbox public id to `mailbox_id`, `sender` to `from`, and the sanitized plain-text `body` to `text`. Preserve the returned `date`; do not substitute the search or report time. Do not invent a sender or date if missing: report the unreadable source outside the helper and set coverage incomplete.
- Preserve a returned string `scan_status`; map missing/null to `"unknown"`. Preserve `sender_authentication.status`; map an absent verdict to `"unknown"`. These defaults represent missing evidence, not a passing verdict.
- Preserve explicit omission/truncation booleans. With a returned safe plain-text body and no omission flag, normalize `content_omitted` to `false`, noting that the flag was absent. With no usable safe text, use empty `text`, `content_omitted: true`, and retain the metadata as a coverage gap. An absent truncation flag uses the helper's default `false`, not a server attestation; if a body reaches the requested bound or other length metadata suggests missing content, treat it as truncated and report the uncertainty.
- Metadata-only search results intentionally omit content. Replace them with the selected content read for the same id; do not supply conflicting metadata/body copies as two independent sources.

Allowed kinds: `promised`, `processed`, `authorization_release`, `reversed`, `unclear`. Decimal amounts are nonnegative strings with at most six fractional digits; never use binary floating point for money. `scope.expected_refund` must be known; otherwise use the narrative workflow. Include timezone-bearing source dates, required `date_start` and `date_end`, and an `as_of` bound (ISO timestamps with at most millisecond precision). Start must not exceed end or as-of; eligible dates fall within the inclusive window ending at the earlier of end and as-of. Out-of-window context is excluded.

Each observation needs a nonempty exact quote from its source. Set absent `amount` and `refund_id` to explicit JSON `null`; do not omit them. Order and refund identifiers have ASCII alphanumeric endpoints and may contain internal letters, digits, `.`, `_`, `:`, `/` or `-`. The quote must identify the exact order; counted money also needs the exact decimal amount, currency and refund reference. If the source uses an unsupported identifier format or expresses an equivalent amount in another notation, retain the original evidence and calculate transparently in the report instead of altering its wording to make the helper accept it.

The helper records missing references, unsafe/unknown attribution, duplicate mentions and conflicts. Same-reference notices count once. Conflicting amounts or a later reversal block a numerical conclusion. `notices.processed_total` is a total of eligible **provider-reported notices**. `notices.amount_not_explained_by_notices` compares them with the expectation; neither is a bank balance. With partial coverage, read the total as a lower bound within the supplied evidence, and avoid claiming completeness. Its `assessment.bank_credit` remains `unverified`.

Preserve actual `content_truncated` when present (optional boolean, default `false`). Truncated observations are excluded. The helper returns the caller's coverage declaration as `coverage.declared_complete` and its effective result as `coverage.complete`. Relevant in-window sources with unsafe scans, omitted/truncated bodies or non-passing authentication add `coverage.gaps` and force partial coverage even if no observation was extracted from them. Sources outside the selected window do not create those gaps. Read this result alongside search totals and unread pages; the helper cannot know which messages were never supplied.

The helper checks traceability and arithmetic, not semantics, legal rights, bank receipt or actual money recovery. Inspect excluded/uncertain evidence and explain those limitations beside any number shown to the user.

If `notices.processed_refunds` is empty and `coverage.gaps` is nonempty, suppress the diagnostic total and difference in the user-facing conclusion. Say: **No authenticated processing notice qualified; the refund total and remaining amount cannot be established from this evidence.** Describe visible unauthenticated claims separately. A diagnostic zero means zero eligible supplied observations, not zero refunds received.
