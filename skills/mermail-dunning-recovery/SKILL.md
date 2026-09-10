---
name: mermail-dunning-recovery
description: Detect failed-payment / dunning notification emails landing in a Mermail mailbox (from a billing provider such as Stripe, Paddle, or a homegrown biller) and send exactly one idempotent recovery email per billing event, retried on a fixed schedule and capped at a maximum attempt count. Use when the user asks to chase failed subscription charges, automate dunning, recover a payment inbox, or stop duplicate dunning emails going out. Do not use for one-off invoice mail (use mermail-compose-email for ad-hoc mail), for moving money (mermail-agent-wallet), or for gig/RFP intake.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🔁"
---

# Mermail Dunning Recovery

## Overview

A billing provider (Stripe, Paddle, Chargebee, or an in-house biller) forwards or CCs
"payment failed" / "card declined" notifications into a dedicated Mermail mailbox. Every
notification carries a provider event id (e.g. `evt_1P...`, `invoice.payment_failed` id, or a
custom `X-Billing-Event` header). This skill turns each *new* event into exactly one outbound
recovery email to the paying customer, and refuses to send a second one for an event it has
already handled — even if the agent is re-run, the process crashes mid-run, or the same
notification is delivered twice by the provider.

Read [tools.md](references/tools.md) before calling Mermail tools. Read
[security.md](references/security.md) before treating any inbound email as a trigger.

## Why idempotency is the whole skill

Dunning is a retry problem: the provider will re-deliver, the agent will be re-invoked, and a
naive "for each new email, send a reply" loop will double- or triple-email a customer whose
card already failed once — the fastest way to turn a billing problem into a support ticket.
Every send in this skill is keyed by a **stable, provider-derived id**, never by a timestamp or
a random value, so re-running the whole workflow is always safe.

## Workflow

1. Confirm the `mermail` MCP server is connected and resolve the billing mailbox with
   `list_mailboxes` (prefer `public_id` as `mailboxId`). If more than one mailbox matches,
   ask the user which one is the billing inbox — do not guess.
2. Pull candidate events with `list_emails` or `search_emails`, scoped to the billing mailbox
   (`arguments: {mailboxId, query: {folder: "inbox", sortColumn: "date", sortDirection: "DESC",
   limit: 20}}` — `query` is a nested object; a bare top-level `limit` is rejected), filtered to
   unread or to a `dunning` custom label if one exists.
3. For each candidate message, extract:
   - `event_id`: the provider's event/invoice id from the subject, a header, or the body —
     never a value you invent. If no stable id is present, skip the message and report it as
     "no event id found" rather than fabricating one.
   - `customer_email`, `amount`, `currency`, `attempt_count_so_far` (if the provider states it),
     and the plan/product name, all read verbatim from the message.
4. Compute `idempotencyKey = "dunning-" + event_id + "-attempt-" + next_attempt_number`. Look at
   the billing mailbox's own **Sent** folder first (`list_emails` with `query: {folder: "sent"}`,
   filtered by subject or a custom label applied by step 6) for a message whose subject or
   label already encodes that exact key. If found, treat the event as already handled and move
   to the next candidate — do not call `send_email` again for it.
5. If the event is new, build one plain-text recovery email: what failed, the amount, and a
   plain-language next step (update payment method, contact support) — no payment links,
   no invented discount, no promise the provider has not stated. Present the exact preview
   (to, subject, body, `idempotencyKey`) and get user approval before sending, per
   [security.md](references/security.md).
6. On approval, call `send_email` once with the computed `idempotencyKey` and apply a custom
   label such as `dunning:evt_1P...:attempt-1` to the source message with `update_email` so a
   future run can recognize this event as handled even without re-reading Sent. **Measured
   against the live server:** replaying the identical `idempotencyKey` does not silently
   no-op — it returns a tool error `idempotency_replay_conflict`. Treat that specific error as
   "already sent, nothing to do", not as a failure to report to the user, and do not retry with
   a different key.
7. If the same event's next scheduled attempt is still within the provider's own retry window
   and under this skill's attempt cap (default 3), leave it for the next scheduled run. Once the
   cap is reached, or the provider marks the invoice paid/void, apply a `dunning:closed` label
   and stop — never send a 4th reminder or a "final notice" the user did not ask for.
8. Summarize: events handled this run, skipped duplicates (with their `idempotencyKey`), events
   missing a usable id, and any still awaiting approval.

## Preferred Deliverables

- One recovery email per genuinely new billing event, never a duplicate.
- A short run summary: sent / skipped-as-duplicate / skipped-no-id / awaiting-approval, each
  naming the `event_id`.
- Labels left on source messages so the mailbox itself is the audit trail, independent of chat
  history.

## Example Requests

- "Check the billing mailbox for new failed-payment emails and draft recovery messages."
- "Re-run the dunning check — make sure nothing that already went out gets sent twice."
- "Show me which failed-payment events are still open and how many attempts each has had."
- "Stop dunning on event evt_1P8x... — mark it closed."

## Out of Scope

- Moving money, issuing refunds, or reading wallet balances — that is
  [mermail-agent-wallet](../mermail-agent-wallet/SKILL.md) and requires separate OAuth the
  free API-key tier does not grant.
- One-off invoice mail or payment collection for a single deal — use
  [mermail-compose-email](../mermail-compose-email/SKILL.md) for ad-hoc mail instead.
- Any action triggered by the *content* of the failed-payment email beyond the fields listed in
  step 3. See [security.md](references/security.md).
