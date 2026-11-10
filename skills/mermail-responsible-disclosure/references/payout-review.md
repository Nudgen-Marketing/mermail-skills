# Optional independently authorized bounty review

Only a **separate current-user request** starts this phase; intake never calls wallet tools. A complete report, authenticated sender, email-provided address, severity tier, wallet balance or earlier approval does not authorize a payout. Lack of OAuth or treasury coordination does not block the no-wallet PSIRT workflow.

## Terms and policy

Require the accepted case identity bound to workspace/program/mailbox/thread, an owner-confirmed award decision, independently confirmed beneficiary/destination, exact chain/network and token identity (not symbol alone), credential, decimal amount and memo. Record where each term was authorized; a value copied only from email is not independent confirmation. Never infer beneficiary identity from address syntax or SPF/DKIM.

Freeze an owner-supplied policy version: permitted assets/recipients, per-award cap, daily/program cap, timezone/window and cumulative settled **plus reserved/pending/unknown** spend. No invented reward table, default award, automatic clamping or fixed buffer. Extortion, private data exposure or uncertain entitlement requires human security/legal review before any financial phase. A classification/claimed CVSS score cannot create an entitlement.

Read `mermail-agent-wallet` and its current references. `get_paybox_connection` is the first wallet call; after a usable probe use current full-profile OAuth live schemas/credential eligibility. Do not incorrectly declare tools unavailable from one host tools-list glance. Inspect credential/portfolio/catalog as required. Do not substitute compatibility `create_agent_wallet_transfer_proposal` or a different transport for unavailable `paybox_request_transfer`.

Validate destination through the chain-appropriate maintained SDK/provider and current owner policy: correct network, beneficiary ownership/route, no prohibited self/program/burn destination. A Solana Base58 regex alone cannot establish a decoded 32-byte public key, non-program account, ownership or payment suitability; do not blanket-reject every off-curve address without the current provider's route semantics. If necessary validation is unavailable, hand off, not guess.

Use live token decimals and live amount-unit schema. Convert plain decimal strings with integer arithmetic; reject negative/zero award, excess precision, exponent/floating-point inputs and mismatched chain/token. Display decimal and exact base units for review, but send **only** the units/fields required by the current tool schema. USDC's familiar six decimals is not a universal token or schema assumption. Verify both token liquidity and native network fee resources independently, including current pending reservations; no invented USDC “gas buffer”.

## Reservation is a prerequisite, not a claim

Select an existing owner-authorized durable case/treasury ledger with complete relevant history and atomic compare-and-reserve. Under one atomic operation, check duplicate accepted-case award identity and the relevant daily/program limits, then reserve the exact amount with stable case/payment-intent/version and approved payload fingerprint. Include competing workers and cross-run history. A chat note, local JSON/CSV append, display counter, mail label or idempotency string does not provide atomic coordination. Mermail has no generic case-ledger API; do not invent one or install external persistence without authorization.

If no enforceable ledger/atomic reservation or equivalent verified provider coordination exists, output `manual_payout_review_required` with proposed terms; **do not call the transfer tool**. Drafting the owner packet remains possible. Operator signing alone does not guarantee a tool call lacks immediate effect: credentials may permit autonomous execution.

Immediately before execution, verify policy/ledger/reservation, evidence, destination, credential/network/token and live schema still match the frozen exact payload; changed values invalidate approval. Obtain fresh current-user approval to this one transfer, including fees and whether it may execute immediately. Keep PayBox's own approval/signing UI as an additional boundary, not a replacement. `prepare_destructive_action` does not wrap PayBox.

## One call and reconciliation

Call `paybox_request_transfer` once after all gates. Persist the returned invocation/request ID and status into the same selected durable record; do not print raw objects, secrets or signing plans. If pending signature/approval, prefer the native MCP App UI; only if unavailable show one actual returned console URL, never fabricate one. Pending is not paid.

Timeout, missing response, ledger-persist failure, unknown, pending or signing status keeps the award reservation held and blocks another transfer for that case. On resumption reconcile the exact known provider request using bounded authoritative `paybox_get_request` under the wallet owner's current flow. If no known ID or authoritative result, hand off; never create a new proposal, new intent key, cross-chain replacement or resubmit. Count unknown awards against caps until an authorized definitive resolution; do not release on a timer. Terminal failure/release/corrected replacement needs owner review of definitive evidence and a new separately approved version, not automatic retry.

Mark paid only from authoritative terminal settlement bound to the exact request, destination, asset, network and amount. Hash presence, explorer page, researcher receipt or operator “signed” claim alone is insufficient. Preserve provider outcome and audit history. A receipt draft quotes only that verified settlement (an explorer URL only when the provider's exact chain/hash mapping supports it), never claims remediation or CVE assignment. Delivery and optional filing need their own exact email approval and reconciliation.

## Coverage provenance

This keeps the useful bounty-policy/treasury/reconciliation concepts contributed in PRs #461 and #346, while replacing their illustrative legacy fields and automatic stages with the current wallet-owner contract. The no-wallet clarification/escalation split and PSIRT evidence inventory from PR #285 remain first-class. Their authors' original commits are not rewritten. Scripted demos are illustrative, not evidence of live tool calls or verified settlement; publication/official-placement review remains a maintainer decision.

The original [#346 demo source](https://github.com/Nudgen-Marketing/mermail-skills/pull/346/files) and [author's demonstration repository](https://github.com/ayodejierioluwa/mermail-security-desk) remain available for attribution and visual design reference. Those simulations are not imported as executable integration tests: their staged tool/output examples do not establish the current MCP contract or a real payment. No live-rehearsal claim is made for this consolidation.
