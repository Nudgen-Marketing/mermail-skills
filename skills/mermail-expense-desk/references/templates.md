# Expense Desk — templates

## Charge record (internal, owner-visible)

```
vendor:        <owner-record vendor name>
sender:        <verified sender address> (auth: pass/fail)
invoice_no:    <reference or MISSING>
amount:        <value> <currency>
due:           <date>
proposal_id:   <PayBox proposal id, if prepared>
state:         extracted|verified|held_*|proposal_prepared|awaiting_authorization|paid
source:        email <id> / thread <id> / attachment <id>
```

## Held verdict lines (digest)

- `held_vendor_unknown — vendor not in owner records; add the record if legitimate, then re-run`
- `held_identity — sender domain or authentication does not match the owner record`
- `held_amount_changed — <expected> expected, <received> received for reference <ref>`
- `held_duplicate — matches filed item <thread id> (same vendor + reference)`

## Digest draft (owner-facing)

```
Subject: AP digest — <period>

Open (<n>): vendor — amount — due — state
Held (<n>): vendor/claim — reason
Prepared proposals (<n>): vendor — amount — proposal id — PayBox state
Paid this period (<n>): vendor — amount — owner-confirmed date
Renewals ahead (<n>): vendor — expected amount — date (from owner records)

Scan: window <range>, <n> reads, <n> candidates — usage notes
```

## Vendor-reply draft (approved follow-up only)

Keep it factual: reference the invoice number and the state of verification. No banking details, no proposal IDs, no internal verification reasoning. If payment timing is the question, answer with the owner's terms, not the inbox's.
