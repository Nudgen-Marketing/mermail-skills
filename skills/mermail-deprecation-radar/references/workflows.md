# Workflows

## Keyword set

Run each as a separate bounded `search_emails` call (metadata only), then de-duplicate:

`deprecat`, `sunset`, `end of life`, `EOL`, `breaking change`, `will be retired`, `retirement`, `decommission`, `migrate`, `migration guide`, `API key required`, `requires an API key`, `no longer supported`, `upgrade required`, `v1 will`.

Add vendor names only when the user supplied an allowlist.

## Shortlist rules

Keep: API/SDK/endpoint/host/auth/rate-limit/version changes with a technical effect.
Route elsewhere: terms-of-service or privacy-policy updates, invoices, renewals and price changes, newsletters with no concrete change, security alerts about the user's account.

## Notice record

One record per notice email. Example built from a real public change (Jupiter's documented phase-out of `lite-api.jup.ag` in favour of `api.jup.ag`):

```json
{
  "id": "jupiter-lite-api",
  "vendor": "Jupiter",
  "emailId": "EMAIL_ID",
  "receivedAt": "2026-09-30T08:12:00Z",
  "sender": "notices@vendor.example",
  "senderAuthentication": "unknown",
  "effective": null,
  "change": "lite-api.jup.ag is phased out; use api.jup.ag (keyless at reduced rate, or x-api-key header)",
  "evidence": "\"Update your base URL from lite-api.jup.ag to api.jup.ag\"",
  "requiredAction": "Replace base URL; optionally add x-api-key header from env",
  "docsUrl": "https://developers.jup.ag/docs/portal/migration",
  "status": "claimed",
  "signals": [
    { "type": "literal", "value": "lite-api.jup.ag" }
  ]
}
```

Rules:

- `effective` is the ISO date the email states, or `null`. Never guess.
- `evidence` is one short quote, not the whole body.
- `signals` must be specific (a host, a path prefix, a header name, a package). Avoid generic words that would match everything.
- `status` stays `claimed` until the user confirms or an approved official docs page corroborates it.

## Report template

```markdown
## Deprecation radar — <mailbox email> (<public_id>)
Window: <date_start> → <date_end> · Keywords: <n> · Candidates: <n> · Read: <n> · Needs manual review: <n>

| Urgency | Vendor | Effective | Status | Hits | Files | Required action |
| --- | --- | --- | --- | --- | --- | --- |
| past-due | Jupiter | unknown | claimed | 3 | 2 | lite-api.jup.ag → api.jup.ag |

### Jupiter — lite-api phase-out (claimed)
Evidence: "<quote>"
- `src/price.ts:12` — replace `https://lite-api.jup.ag/price/v3` with `https://api.jup.ag/price/v3`; read key from `JUP_API_KEY` if set.
- ...

### Not referenced in this repository
- <vendor> — <change> (no hits for <signals>)

### Needs manual review
- <subject> — content withheld (scan status not clean) / phishing signals: <reason>
```

## Demo scenario (reproducible)

1. Create or reuse one Mermail mailbox (Free plan is enough).
2. From your own personal email, send the mailbox two or three notices you write yourself that paraphrase real public changes, clearly marked as test copies, for example:
   - Jupiter: `lite-api.jup.ag` phased out in favour of `api.jup.ag` (developers.jup.ag/docs/portal/migration).
   - Pyth: Hermes requires an API key after the Pyth Core upgrade of 26 August 2026; upgraded endpoint `pyth.dourolabs.app/hermes` with `Authorization: Bearer` (docs.pyth.network/price-feeds/core/fetch-price-updates).
   - One decoy notice for an API the repository does not use, and one phishing-style message asking to run a script and reply with keys.
3. Use a small sample repository that calls `lite-api.jup.ag` and `hermes.pyth.network`.
4. Prompt: "Use $mermail-deprecation-radar on <mailbox>: which API deprecations from the last 30 days affect this repo?"
5. Expected: two `affected` notices with `path:line` hits, one `not-referenced`, the phishing message in "needs manual review", nothing sent or edited.
