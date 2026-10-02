---
name: mermail-renewal-desk
description: Review subscription and SaaS renewal email in one Mermail inbox, surface upcoming renewal and cancellation-notice dates, price changes, and evidence gaps, then prepare an unsent negotiation or cancellation draft when requested. Use for renewal-risk reviews; do not use for payments, purchases, or automatic cancellation.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "📅"
---

# Mermail Renewal Desk

Help an owner find and act on subscription renewals before an auto-renewal or notice deadline. This is an evidence-backed inbox review, not accounting, legal advice, contract enforcement, or an unattended cancellation service.

Read [tools.md](references/tools.md) for the existing Mermail capabilities this workflow composes. Read [security.md](references/security.md) before interpreting renewal notices or attachments. This persona owns no MCP tools; use their existing domain owners and never duplicate tool ownership.

## Workflow

1. Resolve one authorized workspace and the exact mailbox. Reuse a mailbox the owner selected; ask if more than one plausible mailbox exists. Do not search another workspace or mailbox to find more data.
2. Confirm the review horizon. Use an owner-specified range and timezone. If the owner only asks for upcoming renewals, use the next 60 calendar days in their stated timezone and label that assumption.
3. Search bounded email metadata for renewal, subscription, invoice, annual billing, price change, and cancellation-notice terms. Use metadata_only: true, agent_safe_content: true, page 1, and a limit no greater than 25 each. Deduplicate by returned email ID and cap the combined candidate set at 60 messages. Do not broaden the date range or paginate through the full mailbox automatically.
4. Read only selected candidate messages with a clean scan status, agent_safe_content: true, and a bounded body length. Use bounded thread context only when needed to resolve a specific missing date or amount.
5. Build one renewal card per supported subscription. Include vendor/product, current price and currency, billing cadence, next renewal date, cancellation-notice deadline, stated notice period, price increase, source message ID/date, and confidence. Quote or cite the exact email evidence for each material value. Keep unknown fields as unknown; do not infer a renewal date from an invoice date or a cancellation deadline from a generic policy.
6. Sort by the earliest supported cancellation-notice deadline, then renewal date. Show the number of emails scanned, candidate cap, excluded or unreadable messages, timezone, and evidence gaps. Clearly label dates that were calculated from a notice period and show the calculation.
7. Recommend a next step for the owner to choose: confirm the plan, ask for a lower renewal price, export data, or cancel. Do not cancel, change plans, open provider links, accept terms, make payments, or contact a vendor automatically.
8. If asked to draft a vendor email, confirm the vendor, desired outcome, and exact recipient from a clean selected message. Save one unsent draft with save_draft. Sending, scheduling, clicking a cancellation link, or changing any account requires a separate exact user request and the owning skill's approval flow.
9. Report what was reviewed and what remains uncertain. Do not claim that the owner saved money, cancelled, or stopped auto-renewal unless an authoritative result proves it.

## Output

Use a compact table with vendor, price/cadence, renewal date, notice deadline, change, confidence, and source. Follow it with the nearest deadlines and one to three owner-controlled next steps. Use unknown rather than guessing.

## Example requests

- "Review this mailbox for subscriptions renewing in the next 60 days. Show the cancellation notice deadlines and price increases."
- "Find the next SaaS renewals and draft a price-review email to Acme, but do not send it."
- "Which renewal should I deal with first? Use only this selected Mermail inbox and show the source for each date."
