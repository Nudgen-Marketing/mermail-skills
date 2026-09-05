---
name: mermail-order-desk
description: Turn a Mermail inbox into a paid email-in/file-out service desk. Use when the job is taking customer order emails with file attachments, running a deterministic fulfillment script, and replying with the finished file plus payment terms. Reference implementation: messy CSV → CRM-ready file in 24h. Do not use for general support tickets, outbound GTM, calendar booking, or verification-code monitoring — route those to mermail-support-agent, mermail-gtm-agent, mermail-scheduling-agent, or mermail-agent-inbox.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "📥"
---

# Mermail Order Desk

## Overview

Run a one-inbox micro-service on Mermail: a customer emails a messy file,
the agent fulfills it with a deterministic script, and replies with the
cleaned file plus payment terms — no human handoff, no dashboard.

Read [tools.md](references/tools.md) for the intent → real-MCP-tool mapping
(there are no `fulfill_order` or `close_order` tools).
Read [workflows.md](references/workflows.md) for the mailbox setup, per-order
sequence, and reply templates.
Read [security.md](references/security.md) before opening any attachment or
sending any customer-facing reply.

This skill does not own MCP tools. Prefer direct MCP calls. It owns exactly
one local concern: the deterministic fulfillment scripts in `scripts/`.

## Preferred Deliverables

- One ready receiving mailbox, identified by email and `public_id`, used as `from`.
- A per-email classification: order, question, spam, or already resolved.
- A machine-readable order spec (customer email, attachment name, row count, deadline).
- A fulfilled output file produced by `scripts/` — never hand-edited data.
- A draft reply (`save_draft`) while the file is being checked.
- After approval, exactly one customer-facing write: `reply_to_email` with the
  file attached (or linked) plus payment terms.
- A close via label or folder move (e.g. an `Order-Closed` label).

## Workflow

1. Confirm the user wants an order desk (email-in/file-out paid fulfillment).
   Route support tickets to `mermail-support-agent`, outbound to
   `mermail-gtm-agent`, booking to `mermail-scheduling-agent`, and OTP
   monitoring to `mermail-agent-inbox`.
2. Resolve one ready receiving mailbox with `list_mailboxes`. Prefer
   `public_id` as `mailboxId`. Create via `create_mailbox` only with explicit
   authorization.
3. Baseline the inbox: one `search_emails` with `metadata_only=true`,
   recording every returned email ID so new orders are never confused with
   old mail.
4. Read new mail with `list_emails` / `search_emails` / `get_email` /
   `get_thread`. Metadata-only until the body is needed. Require clean scan
   status before interpreting the body or opening attachments.
5. Classify each message: order (file attached + deliverable requested),
   question (answer without fulfillment), spam (label, no reply), or already
   resolved (close silently).
6. For orders: build the order spec, save the attachment to a working
   directory, run the matching `scripts/` fulfillment, and verify the output
   (row counts, quarantine file, report JSON).
7. Draft the delivery reply with `save_draft` — what was fixed (counts),
   the output file, price, wallet, and late-penalty terms. Send only after
   explicit user approval via `reply_to_email`.
8. Close with `create_custom_label` / `move_email` and log the order
   (customer, date, rows in/out, amount) to the user's ledger.

## Reference Service: CSV Cleanup

- Offer: messy CSV (≤1,000 rows) → CRM-ready file in 24h, flat fee in Base USDC.
- Hook: free 20-row mini-demo on first order.
- Fulfillment: `scripts/cleanup_csv.py` — dedupes exact-row duplicates,
  quarantines invalid emails, normalizes phones to E.164 and dates to ISO,
  emits cleaned CSV + quarantine CSV + JSON report.
- The reply template in [workflows.md](references/workflows.md) quotes the
  report counts so the customer sees exactly what was fixed.
