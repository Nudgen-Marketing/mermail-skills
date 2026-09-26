# Workflows

## Exact request: “Buy Apple with 100 USDC”

1. Search the published catalog using the explicit text. If the complete result is uniquely selectable, preserve that product and `100 USDC`; otherwise ask the user to choose from a short list.
2. Verify the chosen product on Solana and preserve its exact mint/evidence. Require the snapshot-backed identity result and read live RPC dependency checks separately. Before any swap exists, a retryable dependency error may be checked once after at most two seconds; all other failures stop immediately.
3. Probe PayBox. Use a provider-declared user default or the sole eligible wallet; ask only when multiple choices remain. Never infer default from autonomous permission.
4. Read portfolio. If funding is needed, open the returned Funding handoff, retain the product/amount in conversation state, then refresh balance once.
5. Show the exact proposed pair and amount, then call `paybox_request_swap` once. Let its MCP App show current quote, fee, minimum received, approval, and signing.
6. Stop on pending. After the user finishes or asks for status, call `paybox_get_request` once using the same request ID.

## Category request

Query only evidence-backed category slugs. Show a compact list with product, ticker, evidence URL, source type, and verification availability. Ignore assignments where `verified=false`, provenance is absent, or `invalidatedReason` is present. Ask the user to choose; a category is never authority to select an investment.

If no verified product matches, say the category is currently unclassified or unsupported. Do not broaden the category, infer it from product names, or turn an invalidated assignment into a result. Offer an exact product-name or symbol search. Missing sector/theme does not block an exact product whose mint verification succeeds.

## Changed or expired terms

The PayBox UI must display refreshed terms. Do not submit silently. If the user closes and reopens the handoff, continue the existing request; do not call `paybox_request_swap` again.

## Timeout or uncertain outcome

Keep the original request ID. Reconcile it; never create a second transaction. Report `uncertain` when authoritative status is unavailable.

## Verification and execution capability

`identity.verified` proves the current catalog fingerprint and exact evidence checks. It does not prove PayBox can execute every Token-2022 behavior. Pass `executionRequirements` through to the normal Mermail guard. If Mermail returns `provider_capability_missing`, report the named capability and stop without retrying verification, calling another provider, or creating a fallback transaction.

Use `blocked` only before an execution request is created, `pending` after a request awaits review/signing/provider processing, and `uncertain` when submission may have occurred but status cannot be reconciled. Do not claim a balance is unchanged unless it was read or established by an authoritative result.
