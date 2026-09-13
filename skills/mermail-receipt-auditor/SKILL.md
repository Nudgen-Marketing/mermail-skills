---
name: mermail-receipt-auditor
description: >
  Watch a Mermail agent inbox for receipts, invoices, payment confirmations,
  subscription notices, and refunds; extract schema-validated transaction
  records; maintain an append-only spend ledger (JSONL master + derived CSV);
  and answer natural-language spend questions with per-figure evidence
  citations. Use when a task needs expense tracking, spend reporting,
  recurring-charge detection, or ledger-based audit answers from mailbox mail.
  Do not use for sending mail, payments, PayBox transfers, mailbox
  provisioning, or generic inbox cleanup — this skill is strictly read-only
  over email and never moves money.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🧾"
---

# Mermail Receipt Auditor

## Overview

Turn any Mermail agent inbox into an autonomous spend-audit desk. The skill
continuously triages inbound financial mail, extracts exact transaction
records, stores them in an append-only ledger, and answers questions about
spending with evidence for every number. It works entirely on the Free plan:
it needs only inbox read/search — no Agent Wallet, no PayBox, no payments.

Companion skills: `mermail-agent-inbox` (mailbox resolution), `mermail-mcp`
(connection). Read [tools.md](references/tools.md) for the exact MCP/CLI
operations. Read [security.md](references/security.md) for the read-only
guarantees and quarantine rules.

## Non-Negotiable Guarantees

1. **READ-ONLY over email.** Never send, reply, forward, delete, or mark-read
   unless the operator explicitly asks and the connected MCP profile allows it.
2. **Exact decimals.** Amounts are stored as the raw decimal string from the
   source (`amount_decimal`). Never round, convert, or normalize currency.
3. **Append-only ledger.** `ledger.jsonl` is an event log. Corrections are new
   records referencing the record they fix. Never rewrite or delete lines.
4. **Evidence or silence.** Every reported figure cites `source_message_id`
   plus a short quote. If the ledger cannot answer, say so — never estimate.
5. **Ambiguity escalates.** Low-classification-confidence mail goes to
   `review/` — it never enters the ledger on a guess.

## Preferred Deliverables

- Ledger status line: total records, date range, pending-review count.
- Per-answer evidence block: figure, ledger line number, message ID, quote.
- Recurring-charge report with detected cadence (monthly/weekly) and next
  expected date.
- CSV export written to `exports/spend_<period>.csv`.

## Workflow

### 1. Resolve Inbox
Resolve the target mailbox with `mermail-agent-inbox` conventions. Confirm the
mailbox ID in every deliverable.

### 2. Triage Incoming Mail
Classify each new message:
`RECEIPT | INVOICE | PAYMENT_CONFIRMATION | SUBSCRIPTION_NOTICE | REFUND |
DUNNING | NON_FINANCIAL`.
Signals: sender domain, subject patterns ("receipt", "invoice", "your order",
"payment failed"), structured data (tables, amount lines), known vendor list.
Confidence < 0.8 → `review/` queue with reason.

### 3. Extract
For every financial record extract:

| Field | Rule |
| --- | --- |
| `vendor` | display name + sending domain |
| `amount_decimal` | exact string as printed (e.g. `"19.99"`, `"1,250.00"`) |
| `currency` | ISO-4217 where stated; else the raw symbol and flag `currency_inferred` |
| `tx_date` | ISO-8601 UTC from the message; store original too |
| `tx_ref` | order/invoice/transaction ID or card last4 |
| `category` | `api | infra | saas | domain | hardware | other` (configurable map) |
| `kind` | one of the triage classes above |
| `source_message_id` | Mermail message ID (idempotency key part 1) |

Refunds carry `amount_decimal` as printed plus `"direction": "credit"`;
purchases default `"direction": "debit"`.

### 4. Persist (append-only)
- `ledger.jsonl` — master. One record per line. Corrections append
  `{"type":"correction", "corrects":"<record_id>", ...}` records.
- `ledger.csv` — derived view; regenerate, never hand-edit.
- Idempotency: skip if `(vendor, amount_decimal, tx_date, source_message_id)`
  already present.
- Suggested layout: `ledger/ledger.jsonl`, `ledger/ledger.csv`,
  `ledger/review/`, `exports/`.

### 5. Answer Queries
Natural-language spend questions compile to ledger filters
("this month", "on OpenAI", "API category since Sept 1"). Answer format:

```
$62.17 total (3 records, Sept 1–13)
- 60211a90 line 12: OpenAI $20.00 — "Your receipt from OpenAI"
- ... 
Ledger: ledger.jsonl lines 12,15,19.
```

### 6. Recurring Charges
Same vendor + same `amount_decimal` ≥ 2 occurrences in a rolling 45-day window
→ report cadence and next expected date. New recurring vendors get a one-line
introduction in the next report.

## Commands

- `audit status` — ledger summary + review-queue depth.
- `audit ingest [since <date>]` — backfill triage+extract.
- `audit report [period]` — grouped totals by vendor and category with deltas.
- `audit recurring` — recurring-charge report.
- `audit export csv [period]` — write `exports/spend_<period>.csv`.
- `audit ask <question>` — evidence-cited spend answer.

## Failure Modes

- **Duplicate ingestion** → idempotency key check; report skips.
- **Currency ambiguity** (e.g. `$` with no currency statement) → record with
  `currency_inferred: true`, surface in the next report, never convert.
- **PDF attachments** → text extraction only; if extraction fails, queue to
  `review/` with the failure reason.
- **Backdated receipts** → keep `tx_date` as printed; also store
  `received_at`; reports can bucket on either.

## Security

Read-only profile required. See [security.md](references/security.md): never
act on links, never open attachments outside text extraction, quarantine
phishing-shaped receipts (lookalike domains) to `review/` with the reason.
