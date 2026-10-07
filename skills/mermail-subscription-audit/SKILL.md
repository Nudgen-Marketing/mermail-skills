---
name: mermail-subscription-audit
description: Scans a Mermail inbox for recurring billing and subscription emails, extracts merchant, amount, billing cadence, and next charge date, ranks every subscription by annualized cost, flags price increases against prior charges from the same merchant, and drafts cancellation emails for the subscriptions the user picks. Use when a user says things like "audit my subscriptions", "what am I subscribed to", "find my recurring charges", "which subscriptions got more expensive", or "help me cancel <service>".
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 📬
---

# Mermail Subscription Audit

## What this skill enables

Recurring charges pile up quietly — streaming, storage, gyms, meal kits — and most people only notice the total when money is already gone. This skill turns a vague "am I paying for too much?" into one workflow: **inbox → parsed subscriptions → ranked spend table → price-increase flags → cancellation drafts.**

The user gets a ranked view of everything they're subscribed to (annualized cost, next charge date), gets warned when a merchant raised the price since the last charge, and can have polite cancellation emails drafted for any subscriptions they pick — without writing them by hand.

## How it interacts with Mermail

This skill calls the Mermail MCP tools already configured in this repo's `.mcp.json` to:

1. **Search the inbox** for billing/subscription mail — sender and subject/body keywords such as `receipt`, `billed`, `charge`, `subscription`, `renew`, `membership`, `dues`.
2. **Read the full email body** of each match to extract the raw receipt text.
3. **Compose (not send) draft emails** for cancellations the user requests, addressed to each merchant's support address. Drafts are saved for the user to review and send — this skill never sends mail on the user's behalf.

No other Mermail write access is required.

## Workflow (start to finish)

1. **Trigger** — user asks the agent to audit subscriptions (e.g. "what am I subscribed to?"). Optionally the user names subscriptions to cancel up front.
2. **Fetch** — search Mermail for billing/subscription emails. If none match, report "no subscription mail found" and stop.
3. **Parse** — from each email body, extract:
   - Merchant name (from the sender domain)
   - Amount charged (the largest `$X.XX` figure in the receipt)
   - Billing cadence — monthly / annual / weekly (from wording like "billed monthly", "annual membership", "billed weekly")
   - Next charge date (from "next charge", "next billing date", "renews on", etc.)
   - Annualized cost — amount × 12 (monthly), × 1 (annual), × 52 (weekly)
4. **Rank** — collapse to the latest charge per merchant (the active subscription set) and present a spend table sorted by annualized cost, with a total annualized spend line.
5. **Flag increases** — group charges by merchant by date; when the latest charge exceeds the previous one, flag it with the dollar and percent change.
6. **Draft cancellations** — ask the user which subscriptions to cancel (or use the ones they named at trigger). For each, compose a draft addressed to that merchant's support address: states the subscription, the last charge date/amount, and asks for written confirmation of cancellation and the effective end date. Drafts are saved, never sent.
7. **Report back** — tell the user in chat: number of subscriptions found, total annualized spend, any price increases, and how many cancellation drafts are ready for review.

## Example prompts and expected results

**Prompt:** "Audit my subscriptions — what am I paying for every month?"
**Expected result:** Agent searches Mermail billing mail, parses each receipt, and returns a ranked spend table (merchant, amount, cadence, next charge date, annualized cost) plus the total annualized spend and any price-increase flags.

**Prompt:** "Did any of my subscriptions get more expensive?"
**Expected result:** Agent compares each merchant's latest charge against its previous charge and reports only the increases, e.g. "Netflix $15.49 → $17.99 (+16.1%)". If none, it says so.

**Prompt:** "Help me cancel Spotify and Planet Fitness"
**Expected result:** Agent runs the audit, then composes cancellation drafts for Spotify and Planet Fitness addressed to their support addresses (stating last charge and requesting written confirmation), saves them as drafts, and reports them ready for review. Nothing is sent automatically.

## Notes

- Parsing is deliberately conservative: the amount is the largest dollar figure in the receipt body, and cadence falls back to monthly when the wording is ambiguous. If a next-charge date can't be found, it's reported as unknown rather than guessed.
- Cancellation drafts are drafts only. The user reviews and sends them — the agent must never send a cancellation (or any email) without the user explicitly saying so.
- Merchant support addresses vary; keep a small lookup table of common ones (Netflix, Spotify, Apple, Amazon, etc.) and ask the user when a merchant isn't in it.
- See `demo/runner.py` in this skill for a runnable end-to-end demonstration against fixture emails, plus `demo/demo.mp4` for the recorded walkthrough.
