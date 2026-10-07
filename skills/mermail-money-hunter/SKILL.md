---
name: mermail-money-hunter
description: Finds money hiding in your Mermail inbox — refundable purchases, price-drop protection claims, forgotten subscriptions, and warranty opportunities. Use when the user wants to recover money from past purchases or audit recurring charges.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 💰
---

# Mermail Money Hunter

Your inbox knows where your money went. This skill finds the money you can get back.

## Modules

### 1. Refund Radar
Scans for order confirmations, extracts refund/return windows, alerts before expiry.

### 2. Price Protection Hunter
Many merchants and credit cards refund the difference if a price drops within X days of purchase.

### 3. Subscription Leak Detector
Finds recurring charges you forgot about. Calculates total "subscription tax".

### 4. Warranty Watch
Identifies products still under warranty that might qualify for claims.

## Workflow
1. Trigger — user asks to hunt for money (or runs on schedule).
2. Sweep — run all four module searches via search_emails.
3. Extract — parse each hit with get_email.
4. Score — rank by expected value: (amount × probability) - effort.
5. Report — show top opportunities with evidence.
6. Act (on approval) — draft emails; never send without explicit approval.

## Reasoning Guide: Hard Cases
- Category-dependent windows ("30 days on electronics, 14 on accessories"): if product category unknown, mark ambiguous.
- Vague windows ("reasonable time"): mark ambiguous, don't guess.
- Date-based windows: resolve to ISO date using email year context.
- Basis ambiguity ("30 days" from purchase vs delivery): default to purchase, flag basis_uncertain.

## Limitations
- Price checks need user-provided URL or web search confirmation.
- Ambiguous cases flagged needs_review, never guessed.
- Cannot initiate returns on merchant sites — prepares drafts only.
- No background execution; use scheduled tasks.
