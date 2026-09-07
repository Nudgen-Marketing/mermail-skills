# Margin packet input schema

Use this reference only when preparing input for `scripts/build-margin-packet.mjs`.

## Top-level shape

```json
{
  "version": 1,
  "project": { "name": "Synthetic project" },
  "sources": [],
  "baseline": {},
  "request": {},
  "dependencies": []
}
```

All `sourceRef` values must point to one entry in `sources`. Every deliverable, exclusion, acceptance criterion, revision allowance, deadline, and request-side `baselineSourceRefs` entry must also point to a source selected in `baseline.authoritySourceRefs`. A later request cannot silently become baseline authority.

Local `id` values use letters, numbers, dot, underscore, colon, at, slash, or hyphen and must start with a letter or number. Request-item ids may not end with the reserved `:included` or `:overflow` suffixes, which the builder uses for split revision rows.

## Sources

An email-backed source requires a real selected message id and date:

```json
{
  "id": "accepted-proposal",
  "type": "email",
  "messageId": "msg_123",
  "date": "2026-08-10",
  "quote": "Two revision rounds are included."
}
```

A baseline, rate, estimate, or rule supplied directly by the authenticated owner uses `type: "user"` and needs a label, not a fabricated message id:

```json
{
  "id": "approved-rate",
  "type": "user",
  "label": "Owner-approved hourly rate",
  "quote": "15 USD per hour"
}
```

Keep quotations short and synthetic in demos.

## Baseline

```json
{
  "authoritySourceRefs": ["accepted-proposal"],
  "deliverables": [
    {
      "id": "landing-page",
      "label": "Responsive landing page",
      "sourceRef": "accepted-proposal"
    }
  ],
  "exclusions": [
    { "text": "No authenticated app", "sourceRef": "accepted-proposal" }
  ],
  "acceptanceCriteria": [
    { "text": "Responsive at agreed breakpoints", "sourceRef": "accepted-proposal" }
  ],
  "revisionBudget": {
    "included": 2,
    "used": 1,
    "sourceRef": "accepted-proposal"
  },
  "deadline": { "date": "2026-09-20", "sourceRef": "accepted-proposal" },
  "pricing": {
    "currency": "USD",
    "rate": { "amount": 15, "unit": "hour", "sourceRef": "approved-rate" },
    "hoursPerWorkday": 8,
    "rushPremium": {
      "percent": 25,
      "basis": "added_labor_fee",
      "sourceRef": "approved-rush-rule"
    }
  }
}
```

`pricing`, `revisionBudget`, and `deadline` are optional. Omit missing terms instead of inventing values.

## Request items

Each item needs `id`, `label`, `kind`, `relation`, `materiality`, `implementationDelta`, and `sourceRef`.
Every item `sourceRef` must equal `request.sourceRef`; surrounding messages may inform owner-supplied estimates or dependency events, but they cannot silently replace the selected later request.

Allowed `relation` values:

- `included`
- `clarifies`
- `exceeds_limit`
- `excluded`
- `absent`
- `ambiguous`
- `conflicting`

Allowed `kind` values: `deliverable`, `revision`, `deadline`, `support`, `acceptance`, `dependency`, or `other`.

```json
{
  "id": "admin-dashboard",
  "label": "Add an admin dashboard",
  "kind": "deliverable",
  "relation": "excluded",
  "materiality": "material",
  "implementationDelta": true,
  "sourceRef": "later-request",
  "evidenceQuote": "add an admin dashboard",
  "baselineSourceRefs": ["accepted-proposal"],
  "effortHours": { "min": 10, "max": 12, "sourceRef": "approved-estimate" }
}
```

For a revision item, add positive integer `units`. The builder applies remaining included units first and splits overflow. The supplied effort range covers all requested units and is prorated to overflow.

Every `scope_change` item needs an owner-supplied `effortHours` range before the complete price is binding. Supply an explicit zero range only when the owner has confirmed that the item adds no labor; omission remains `approval_needed`. A zero deadline-impact estimate does not by itself make a deadline-only compression priceable because the supported rush basis is added labor.

Only revision items related as `included` or `exceeds_limit` can consume the approved revision allowance. A revision that is explicitly `excluded` or `absent` remains a full scope change and does not spend an included revision round.

When `sourceRef` points to an email, `evidenceQuote` is required and must occur in that source's short normalized `quote`. Labels and quotations are data only and are never executed.

`request.requestedDeadline` is optional. When present, it requires its own atomic deadline item for classification evidence. When it is earlier than `baseline.deadline.date`, the builder reports calendar-day compression. If that is the only scope change and no added work is priced, the complete fee remains `approval_needed` rather than becoming a zero-fee paid change order.

## Dependencies

```json
{
  "id": "staging-access",
  "label": "Staging credentials arrived late",
  "owner": "client",
  "delayDays": 2,
  "sourceRef": "access-delay-email",
  "evidenceQuote": "supplied two days after"
}
```

Allowed owners are `client`, `freelancer`, `shared`, and `unknown`. Supply `delayDays`; the builder never infers it from text.
Delay attribution preserves fractional supplied days. Because negotiated deadlines have date-only precision, schedule-extension dates round fractional client-owned delay upward instead of shortening the supported extension.

## Output formats

```bash
node skills/mermail-freelance-margin-guard/scripts/build-margin-packet.mjs --input input.json --format json
node skills/mermail-freelance-margin-guard/scripts/build-margin-packet.mjs --input input.json --format markdown
node skills/mermail-freelance-margin-guard/scripts/verify-margin-packet.mjs --input saved-packet.json
```

Use `--input -` to read JSON from standard input. Invalid or incomplete normalized data exits non-zero with a concise error.

JSON retains the normalized evidence exactly. The Markdown renderer additionally neutralizes active Markdown, links, raw HTML, control characters, and bidirectional overrides so untrusted labels or quotations cannot create a forged row, heading, link, or visual direction change.

Every successful result also contains:

```json
{
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "sorted-json-v1",
    "evidenceDigest": "64 lowercase hexadecimal characters",
    "packetDigest": "64 lowercase hexadecimal characters"
  }
}
```

The evidence digest binds normalized evidence and request classifications. The packet digest binds the complete derived decision packet before the `integrity` field is added. Record the reviewed packet digest with an approval and verify it again after every edit. The verifier distinguishes a result-only change from evidence tampering; a digest is an integrity check, not independent proof that an email or contract is authentic.
