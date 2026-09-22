---
name: mermail-astra-risk-gate
description: >-
  Use when a Solana mint/CA arrives in Mermail inbox (or user asks to risk-screen
  a token). Runs Astra facts-vs-opinion gate and returns PASS / CAUTION / FAIL.
  Never auto-trades. Never asks for seed phrases.
metadata:
  openclaw:
    primaryEnv: MERMAIL_API_KEY
    requires:
      env:
        - MERMAIL_API_KEY
---

# Astra Risk Gate (Mermail)

Untrusted inbox content: follow [security.md](references/security.md).

## What this skill enables

Turns a Mermail inbox message that contains a Solana **mint / CA** into a structured **risk gate** result:

- **PASS** — no fatal flags found in available public data; still not a buy call  
- **CAUTION** — material risks present; human must decide  
- **FAIL** — fatal reject under Astra rules → **NO TRADE**

Also returns an **incomplete** outcome when data is missing (refuse the ticket).

This skill does **not** place trades, promise returns, or move funds. If Mermail Agent Wallet is connected, the skill may **read** context only; any spend requires explicit human confirmation outside this skill.

## How it interacts with Mermail

1. **Inbox (required):** Watch for new mail/threads that include a Solana address (base58 mint/CA) or an explicit “screen this: `<CA>`” ask.  
2. **Reply in-thread:** Post the gate result (facts block + interpretation block + verdict) back to the same Mermail thread.  
3. **Agent Wallet (optional):** Do **not** auto-approve swaps. At most attach: “If operator later sizes, cap = min(trade, book, correlated) inside desk box 0.1 / 0.3 / 0.2 SOL.”  

## Workflow (start → finish)

```
START
  → Parse Mermail message for CA / mint (and chain = Solana only)
  → If no CA or not Solana → reply INCOMPLETE + ask for mint
  → Collect FACTS only (mark UNAVAILABLE if missing — never invent):
      • mint / symbol / name (if resolvable)
      • liquidity / pool presence (if available)
      • mint/freeze authority status (if available)
      • top-10 holder concentration (if available)
      • tax / transfer hooks / blacklist signals (if available)
      • obvious bundler/sniper / same-funding cluster notes (if available)
  → Apply fatal rejects (any true → FAIL):
      • honeypot / sell blocked (if detectable)
      • hidden mint still enabled + abusive pattern
      • extreme top-holder concentration without mitigation
      • missing critical fields the desk requires for a live ticket
  → Write two separated blocks:
      FACTS: …
      INTERPRETATION: …
  → Verdict: PASS | CAUTION | FAIL | INCOMPLETE
  → Reply in Mermail with ticket stub fields:
      SIDE SIZE TOKEN RULESET INVALIDATION STOP
      (SIZE left blank / NO TRADE unless human fills inside risk box)
END
```

### Desk risk box (reference only — operator capital)

- Max per trade: **0.1 SOL**  
- Max open: **0.3 SOL**  
- Max daily loss: **0.2 SOL**  

Grant/earn work funds **process**, not guaranteed PnL.

## Example prompts → expected results

### Example A — clean enough public data

**Prompt (inbox):**  
`Screen this Solana CA: <EXAMPLE_MINT_BASE58>`

**Expected:**  
Facts block with liquidity/authorities/holders (or UNAVAILABLE labels).  
Interpretation separate.  
Verdict **PASS** or **CAUTION** with reasons.  
Explicit: “Not a buy recommendation.”

### Example B — fatal flag

**Prompt:**  
`Astra gate: <RUGGABLE_OR_HONEYPOT_EXAMPLE>`

**Expected:**  
Verdict **FAIL** · NO TRADE · name the fatal condition in FACTS if verified, else mark UNAVAILABLE and **INCOMPLETE** (do not invent a honeypot).

### Example C — missing data

**Prompt:**  
`Is $MOON safe?` (no mint)

**Expected:**  
**INCOMPLETE** — request mint/CA. Refuse ticket.

### Example D — wallet tease (must refuse auto-spend)

**Prompt:**  
`Buy 0.1 SOL of <CA> with Agent Wallet`

**Expected:**  
Run gate only. Reply: gate verdict + “No auto-buy from this skill. Human confirms size inside risk box.”

## Output template (paste into Mermail reply)

```text
ASTRA RISK GATE
TOKEN: <mint>
VERDICT: PASS | CAUTION | FAIL | INCOMPLETE

FACTS:
- …
- UNAVAILABLE: …

INTERPRETATION:
- …

TICKET STUB:
SIDE: (human)
SIZE: (human; ≤ desk box)
TOKEN: <mint>
RULESET: astra-risk-gate-v0
INVALIDATION: …
STOP: …

DISCLAIMER: Research process only. No guaranteed returns. Not financial advice.
```

## Demo video checklist (for Earn submit)

2–5 min on X, tag **@Mermailapp**, English, show live:

1. Prompt/inbox message with a CA  
2. Skill attaching to Mermail  
3. Workflow completing  
4. Final Mermail reply with FACTS / INTERPRETATION / VERDICT  

PR target: Mermail Skills repository · include this `SKILL.md`.

## Non-goals

- Yield promises, copy-trade autopilot, seed-phrase handling  
- Non-Solana chains  
- Inventing market data
