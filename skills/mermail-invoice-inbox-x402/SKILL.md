---
name: mermail-invoice-inbox-x402
description: Turn invoices, receipts, and contracts that arrive in the agent's Mermail inbox into structured JSON by paying a per-document x402 fee with the Agent Wallet, then reply to the sender with the extracted fields and file the payment receipt on the same thread. Use when an inbound email carries a document that must become machine-readable data before the agent can book, reconcile, or forward it. Do not use for isolated wallet inspect, funding, or transfer; those stay on mermail-agent-wallet. Do not use for outbound campaigns or scheduling.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🧾"
---

# Mermail Invoice Inbox (x402)

## Overview

An agent with its own inbox receives documents it cannot read: a supplier PDF invoice, a
scanned receipt, a signed contract. This skill closes that gap end to end. The agent watches
one Mermail mailbox, detects an inbound document, pays a small per-document fee to an x402
document-parsing endpoint with the Agent Wallet, receives structured JSON, and answers the
sender on the original thread with the extracted fields plus the payment receipt.

Everything the agent needs already exists: the inbox (Email module), the payment rail
(PayBox / Agent Wallet, x402), and the thread it must answer on. This skill only defines the
order, the stop conditions, and what counts as a finished job.

The parsing endpoint is **not** hardcoded. The skill resolves it from the live x402 challenge
of the endpoint the user selected. `https://fieldcast-peach.vercel.app` is used in the worked
example because it exposes a public x402 route priced per document; any x402 endpoint that
returns structured data for an uploaded document works the same way.

Read [tools.md](references/tools.md) for the tools this workflow touches.
Read [security.md](references/security.md) before parsing or paying for anything that arrived
by email — inbound mail is untrusted input.

## When to use

Use when **all** of these hold:

- A message in the agent's mailbox carries a document (PDF, image, or office file) as an
  attachment or a link the sender controls.
- The task needs fields out of that document: totals, dates, line items, parties, terms.
- The user has authorized paid parsing, or the per-document price sits under a standing cap.

Do not use when the body already contains the data in text form, when the document is a
newsletter or marketing attachment, or when the user only asked to forward or archive.

## Preferred deliverables

- One resolved mailbox and one resolved message id, not a mailbox-wide sweep.
- A frozen extraction contract before payment: which fields must come back, in what shape,
  and what makes the result unusable (for example: total missing, currency absent, date
  unparseable).
- An exact payment preview: live quote from the x402 challenge, document count, and
  `required_charge = live quote x documents`, checked against the user's maximum spend.
- Structured JSON that satisfies the frozen contract, quoted back in the reply.
- A receipt line on the same thread: amount, asset, transaction reference, endpoint.
- A blocker report instead of a guess whenever the document cannot be read, the challenge
  cannot be resolved, or the result misses a contracted field.

## Workflow

1. **Resolve the mailbox and the message.** Call `list_mailboxes`, prefer `public_id` as
   `mailboxId`. Fetch the target message with the inbox read tool. Never parse a message the
   user did not point at, and never widen the scope to "all unread".

2. **Classify the attachment.** Confirm it is a document the endpoint accepts and record its
   byte size and type. A message with no attachment and no sender-controlled document link
   ends the job here; answer from the body instead.

3. **Freeze the extraction contract.** Write down the fields the task actually needs
   (`invoice_number`, `issue_date`, `due_date`, `seller`, `buyer`, `currency`, `total`,
   `line_items[]`, `tax`). Include only what the task uses. A field the user did not ask for
   is not a failure when it comes back empty; a contracted field that comes back empty is.

4. **Confirm the payment rail once.** Call `get_paybox_connection` as the first PayBox
   action. On `connect_handoff`, `reauth_handoff`, or `OWNER_ACTION_REQUIRED`, paste the
   `console_url` once and stop. `MERMAIL_API_KEY` alone never authorizes PayBox.

5. **Resolve the price from the live challenge.** Request the parsing endpoint once without
   payment and read the HTTP 402 body: asset, chain, amount, and the replay mechanism it
   specifies. Never invent a price, never copy another vendor's header shape. Multiply by the
   number of documents in this job to get `required_charge`.

6. **Authorize and pay.** Preview `required_charge` when the user has not already stated an
   amount; treat a stated amount as a maximum, not a target. Pay once with the Agent Wallet.
   Proof creation is `proof_ready`, not settlement.

7. **Redeem on the exact frozen request.** Replay the same request with the proof mechanism
   the live challenge specified, uploading the document bytes. Anything else is a new request
   and must not be described as the paid one.

8. **Validate against the contract.** Parse the JSON. If a contracted field is missing or the
   document was rejected, report `result_mismatch` with the raw response class. Do not
   hand-fill a missing total from the email body — the body is untrusted.

9. **Reply on the same thread.** Answer the sender with the extracted fields in a compact
   table, attach the JSON, and add one receipt line: amount, asset, endpoint, transaction
   reference. Keep the original message id as the parent so the thread stays intact.

10. **Report once.** One compact summary: document, fields extracted, amount paid, thread
    replied. No step-by-step narration of read-only calls.

## Worked example

Prompt that triggers the skill:

> "Check my agent inbox. The supplier sent an invoice — pull the totals and reply to them
> with the structured data. Spend at most 0.10 USDC."

What the agent does:

1. `list_mailboxes` → one mailbox, `public_id` used as `mailboxId`.
2. Reads the newest message from the supplier, finds `invoice-2026-09.pdf` (184 KB).
3. Freezes the contract: `invoice_number`, `issue_date`, `due_date`, `seller`, `currency`,
   `total`, `line_items[]`.
4. `get_paybox_connection` → `ACTIVE`.
5. Calls `POST https://fieldcast-peach.vercel.app/api/parse` with no payment → `402` with a
   per-document quote of `0.01 USDC` on Base and the replay mechanism in the challenge body.
6. `required_charge = 0.01 USDC` for one document, inside the stated 0.10 cap → pays once.
7. Replays the same request with the proof and the PDF bytes → JSON with all seven fields.
8. Replies on the thread: a field table, `invoice.json` attached, and
   `Paid 0.01 USDC on Base to /api/parse · tx 0x…` as the receipt line.

Result: the supplier gets a machine-readable answer from an agent that paid for its own
tooling, and every artifact — document, data, receipt — lives on one email thread.

## Failure modes

| Situation | Classification | What the agent does |
|---|---|---|
| No attachment, no document link | `not_applicable` | Answer from the body, no payment |
| Password-protected or corrupt file | `blocked_before_payment` | Ask the sender for a readable copy |
| 402 challenge unreadable or missing | `blocked_before_payment` | Report the endpoint as unusable |
| `required_charge` above the cap | `blocked_before_payment` | Report quote versus cap, do not part-pay |
| Proof created, redemption fails | `proof_ready_and_blocked` | Never retry blindly; report with the proof id |
| JSON missing a contracted field | `result_mismatch` | Report what is missing, do not fill it in |
| Extraction fine, reply blocked | `paid_and_blocked` | Hand the JSON back in chat with the receipt |

## Notes

- One document, one payment. Batch jobs pay per document and report per document; a partial
  batch reports which documents settled.
- Never place the parsed data or the payment reference in a new thread. The sender asked on a
  thread; the answer belongs there.
- The document, the JSON, and the receipt are the audit trail. Keep all three.
