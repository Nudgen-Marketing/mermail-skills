# Licensing desk templates

All files below are owner-supplied. Keep real addresses and payment references out of any repository.

## Rate card (`rate-card.json`)

```json
{
  "owner": "NoBanks Nearby",
  "version": "2026-10-01",
  "currency": "USDC",
  "items": {
    "wipers": { "title": "WIPERS (NoBanks Nearby)", "kind": "music", "base": "OWNER_SETS", "floor": "OWNER_SETS", "uses": ["sync"], "exclusive_available": false },
    "lone-journey-869359": { "title": "Lone Journey #869359, framed print 19x13", "kind": "print", "base": 140, "edit_price": 125, "floor": 100, "uses": ["print_sale"], "exclusive_available": false },
    "1440-0320pm-12x12": { "title": "1440 \"3:20 PM\", framed print 12x12", "kind": "print", "base": 70, "edit_price": 60, "floor": 50, "uses": ["print_sale"], "exclusive_available": false }
  },
  "multipliers": {
    "media": { "web_social": 1, "podcast": 1.2, "film_festival": 1.5, "broadcast": 2.5, "advertising": 3, "theatrical": null, "print_wall": 1, "merch": 2 },
    "territory": { "us": 1, "north_america": 1.25, "worldwide": 1.75 },
    "term": { "1y": 1, "3y": 1.6, "perpetual": 2.5, "purchase": 1 },
    "exclusivity": { "non_exclusive": 1, "exclusive": 3 },
    "audience": [
      { "max": 10000, "factor": 1 },
      { "max": 1000000, "factor": 1.5 },
      { "max": null, "factor": 2.5 }
    ]
  },
  "rush": { "days_under": 7, "factor": 1.25 }
}
```

A `null` multiplier means the owner does not offer that option; the script returns `needs_owner`. A `base` or `floor` that is not a number (for example `"OWNER_SETS"`) means the owner has not priced that work yet; the script returns `needs_owner` and the agent drafts nothing priced. `edit_price` is informational for the owner and is never used by the script. A physical print sale uses `term: "purchase"` and `territory: "us"` so the quote equals the list price.

## Inquiry terms (`request.json`, built by the agent from the email)

```json
{
  "item": "1440-0320pm-12x12",
  "use": "print_sale",
  "media": "print_wall",
  "territory": "us",
  "term": "purchase",
  "exclusivity": "non_exclusive",
  "audience": 1
}
```

## Split sheet (`split-sheet.json`)

```json
{
  "chain": "base",
  "asset": "USDC",
  "decimals": 6,
  "collaborators": [
    { "name": "Co-producer", "role": "co-producer", "share_bps": 2500, "address": "0x..." },
    { "name": "Featured vocalist", "role": "vocals", "share_bps": 1000, "address": "0x..." }
  ]
}
```

`share_bps` is basis points of the owner-confirmed net (2500 = 25 percent). The owner keeps the remainder. Addresses are validated for format only; the owner is responsible for their correctness.

## Quote reply

```text
Hi {first_name},

Thanks for reaching out about {title}. Here is the quote for the use you described:

Use: {use}, {media}
Territory: {territory}
Term: {term}
Exclusivity: {exclusivity}
Audience: up to {audience}
Fee: {price} {currency}

Quote ID: {quote_id}
This quote covers exactly the terms above. Any change in use, media, territory, or term needs a new quote.

To proceed, reply to confirm and we will send payment details.

{owner_signature}
```

## License confirmation

```text
Hi {first_name},

Payment received. Your license is active.

License ID: {license_id}
Licensed work: {title}
Use: {use}, {media}
Territory: {territory}
Term: {term}
Exclusivity: {exclusivity}
Fee paid: {paid} {currency}

License fingerprint (SHA-256 of the agreed terms and quote): {license_hash}
Keep this email. The fingerprint lets either side prove these exact terms later.

{owner_signature}
```

## Owner summary

```text
Mailbox: {email} ({public_id})
Inquiries: {n_seen} seen, {n_quoted} quoted, {n_clarify} need clarification, {n_owner} need owner, {n_suspicious} suspicious
Awaiting your approval: {draft list with draft IDs}
Sent: {message IDs}
Licenses: {license IDs}
Payouts: {request IDs and states}
Ledger head: {hash} ({entries} entries, verified)
```
