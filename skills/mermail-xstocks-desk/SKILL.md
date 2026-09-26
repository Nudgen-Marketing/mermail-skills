---
name: mermail-xstocks-desk
description: Resolve evidence-backed xStocks from the published catalog, then prepare one user-authorized USDC-to-xStock swap on Solana through the standard Mermail Agent Wallet. Use for one-time xStocks discovery or purchase. Do not use for DCA, ticker-only execution, deposits, transfers, or unattended trading.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "📈"
---

# Mermail xStocks Desk

## Overview

Resolve an exact xStock through the published read-only catalog, then use Mermail's existing PayBox swap and signing flow. The catalog owns identity/category evidence. Mermail owns authentication, wallet access, server-configured re-verification, signing, audit, and reconciliation. This skill creates no separate purchase session and never treats a mint as a deposit address.

Read [tools.md](references/tools.md), [workflows.md](references/workflows.md), and [security.md](references/security.md) before a purchase.

## Preferred Deliverables

- One exact evidence-backed product or a short choice list.
- One standard PayBox swap request with current review/signing UI.
- One authoritative status for the original provider request.

## Workflow

1. Use the fixed catalog base URL `https://xstock.mermail.app` for all catalog and verification requests; no catalog environment variable is required. Query `https://xstock.mermail.app/api/v1/products` with only the user's text/category filters plus `network=Solana&addressStatus=matched&isTradingHalted=false`. Treat a category as usable only when `verified=true`, its evidence URL is present, and `provenance` includes a source type, policy version, evidence hash, and identity fingerprint.
2. Continue automatically only when the complete filtered response says `meta.selection=single` and the user already supplied an exact USDC amount. If it says `multiple`, show a short evidence-backed list and ask the user to choose. Never rank products as investment advice.
3. Query `/api/v1/products/{id}/verification?network=Solana`. Require exactly one mint and `identity.verified=true`; read `executionRequirements` as provider requirements, not identity failures. Continue toward Mermail only for a current top-level `verified` result. If the response is `unknown` with `retryable=true`, no swap has been called, and `retryAfterMs` is present, wait at most `min(retryAfterMs, 2000)` and retry verification exactly once. Never retry halted products, identity conflicts, or provider-capability failures. Product identity verification is independent of sector/theme coverage.
4. Call `get_paybox_connection`, then read live `paybox_*` schemas. If no usable connection, present the returned Mermail handoff. Do not invent a connector URL.
5. Use the user's saved default wallet when the live provider explicitly identifies one, or the sole eligible Solana wallet. If several eligible wallets remain and no user-selected default is returned, ask once. Autonomous capability is not a default-wallet preference.
6. Read `paybox_get_portfolio`. If USDC is insufficient, complete the separate Funding flow and then resume the same selected product and amount after one balance refresh.
7. Preview the exact product name/xStock label, USDC amount, source/destination chain, wallet, mint, and any terms exposed by the live schema. Call `paybox_request_swap` exactly once. Mermail re-verifies identity, mint state, response lifetime, and required PayBox capabilities through its server-configured source before PayBox receives the request. Treat `provider_capability_missing` as `blocked`; do not retry or switch providers.
8. Use the PayBox MCP App for quote, fees, minimum received, approval, and signing. If terms change or expire, the UI must show the new terms before approval. Never claim one-click completion when the provider requires KYC, passkey, or signature steps.
9. Stop on pending. Reconcile the same provider `request_id` once with `paybox_get_request` only after the user confirms signing or asks for status. Never create a replacement swap for timeout or unknown state.

## Safety

- Never call a transfer, x402 tool, host Jupiter API, or arbitrary plugin as an alternate purchase path.
- Never use an email, ticker, catalog result, or wallet autonomous permission as spending authority.
- Never claim a token is “legit in every way.” State what was checked and link the evidence.
- Never infer or repair a missing category. Explain that the current catalog has no verified classification and offer an exact-name/symbol search instead.
- `verified` means the catalog's current identity policy passed. Mermail may still block eligibility, stale policy, provider capability, or execution.
- A mint identifies the token. Never instruct the user to send USDC to the mint.
- Pending, accepted, submitted, and unknown are not confirmed receipt. Success requires the authoritative terminal provider result.
- Say funds or balances are unchanged only after an authoritative pre/post balance read or provider result establishes that fact. “No request was created” does not by itself prove a balance.
- The mint is never a deposit address.
- Production managed-asset execution may remain disabled until provider and eligibility controls are approved.

## Write Safety

Call `paybox_request_swap` once only after the authenticated user supplies the exact product and amount. PayBox provides explicit approval/signing; never start a replacement on timeout, pending, or unknown state. Do not use this skill for DCA.

## Output Conventions

Use `selection_required`, `wallet_required`, `funding_required`, `review_required`, `blocked`, `pending`, `uncertain`, `failed`, or `confirmed`. `blocked` means no execution request was created. `pending` means review/signing or provider processing remains. `uncertain` means a request may exist but authoritative status is unavailable. Use `confirmed` only after provider reconciliation.

## Example Requests

- “Show evidence-backed technology xStocks; do not buy.”
- “Buy Apple with 100 USDC.”
- “I finished signing; check the original request.”
