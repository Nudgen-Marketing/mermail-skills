---
name: mermail-spend-audit
description: Sweep an agent's Mermail inbox for payment receipts, x402 payment proofs, and vendor charges, then cross-check each receipt against PayBox proof records to produce a verified spend report with anomaly flags. Use when the user asks what their agent spent, wants a spending audit or monthly report, suspects double-charges, or needs receipts reconciled before billing. Do not use for initiating new payments (use mermail-agent-wallet), composing general email (use mermail-compose-email), or task triage (use mermail-automate-triage).
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🧾"
---

# Mermail Spend Audit

## Overview

Autonomous agents pay for services (x402 calls, subscriptions, one-off API purchases) and
the receipts land in their Mermail inbox — often unread, sometimes duplicated, occasionally
fraudulent. This skill gives any agent host a **recurring spend-audit workflow**: sweep the
inbox for money-related messages, extract the charge facts, verify them against PayBox proof
records, and emit a structured report that flags every discrepancy worth a human look.

The skill is read-only by design: it never initiates payments and never sends email without
an explicit user confirmation step. Its only side effect is one saved draft (the report),
so it is safe to run unattended on a schedule.

Read [tools.md](references/tools.md) for the exact MCP tools used and
[workflows.md](references/workflows.md) for the step-by-step flows including edge cases.

## What it enables

- **Spend inventory** — every charge found in the inbox for a time window, normalized to
  `{vendor, amount, currency, date, proof_id?, thread}`.
- **Proof verification** — for each x402 receipt, confirm a matching `paybox` proof exists,
  the amount matches, and the status is settled (not `SUBMISSION_UNKNOWN`).
- **Anomaly flags** — duplicates, amount drift vs. the authorized maximum, receipts without
  proofs, proofs without receipts, and unknown vendors.
- **Report output** — a markdown summary saved as a draft in the agent's own inbox plus a
  console table for the transcript.

## When to use

- "How much did we spend this week?"
- "Audit last month's agent purchases."
- "I think a vendor charged us twice — check."
- "Prepare receipts for expense review."
- Scheduled runs (cron): produce the standing monthly report.

## Workflow at a glance

1. **Scope.** Ask the user for a window if not stated (default: current month). Resolve
   mailbox via `list_mailboxes` when more than one exists.
2. **Collect.** `search_emails` with receipt-oriented queries (`receipt`, `invoice`,
   `payment`, `order confirmed`, vendor names from prior audits) inside the window.
3. **Extract.** For each hit, `get_email` → parse `{vendor, amount, currency, date,
   proof_reference}`. Paid-service emails usually embed an `x402` proof id or order id.
4. **Verify.** Group by proof id; call the PayBox connection probe once
   (`get_paybox_connection`) and then reconcile each proof: exists? amount equal?
   status settled? Keep a per-item verdict.
5. **Flag.** Apply the anomaly rules (see [workflows.md](references/workflows.md#anomaly-rules)).
6. **Report.** Render the markdown report; `save_draft` it to the agent inbox; print the
   summary table inline.
7. **Confirm-before-send.** Only if the user asked to share the report does the skill
   `send_email` — after showing exactly what will be sent.

## Example prompts

| Prompt | Expected result |
| --- | --- |
| "Audit my agent spending for August" | Report draft listing every charge found in Aug, totals by vendor, anomalies flagged, zero payments initiated. |
| "Did vendor X double-charge us?" | Search limited to that vendor; both receipts shown side-by-side with proof verdicts; explicit yes/no answer. |
| "Monthly spend report" | Standing report: totals, top vendors, flagged items count, saved as draft titled `[spend-audit] YYYY-MM`. |

## Guardrails

- Read-only against mail data; writes are limited to one report draft.
- Never treats a PayBox proof-creation record as settlement — status must be explicitly
  settled/confirmed, mirroring Mermail's own guidance.
- Amounts are never rounded silently; currency mismatches are always flagged, never merged.
- If PayBox is not connected (`get_paybox_connection` fails), the skill still produces the
  receipt inventory and marks all proofs `UNVERIFIED`.
