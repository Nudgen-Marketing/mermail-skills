# State, scope and evidence contract

[receipt-claims.mjs](../scripts/receipt-claims.mjs) provides pure offline payment-scope routing and comparison of up to five normalized, non-secret receipt claims. It reports claims_consistent, never settlement_verified or authorization. Inputs must already have trusted native safety provenance; client-supplied scan labels are not proof. Normalize amounts to canonical base-unit integers and business identifiers through trusted owner contracts before comparison. Missing/blocked evidence remains pending; this helper neither persists reservations nor verifies cryptographic signatures or receipt timestamps. The user-selected durable store and independent settlement/fulfillment checks below remain necessary.

This contract applies to paid, free, verify-only and externally-paid receipt paths. Preserve independent stage state; one blocked stage does not erase successful earlier work.

## Durable identity before money

Use only a storage location and access model the user selected for this task. Inspect its real schema/locking/idempotency contract. There is no Mermail procurement/upsert/reservation tool. Do not invent one, quietly create a database, claim a draft/label is a lock, or persist secrets.

Resolve the existing logical purchase by workspace, mailbox, exact service/account, plan, billing period and user-confirmed intent before minting procurement_id. A new run timestamp or agent session is not a new purchase. Multiple matches or a missing history segment stop the paid stage for reconciliation.

Before payment persist the frozen effect and approval version, then atomically reserve it with compare-and-set/unique intent under an actual supported store contract, or use an enforced exclusive writer that survives resume and excludes all concurrent workers. A prose claim of single writer is insufficient. If that capability is absent, continue safe reads, free signup and exact payment preview, then hand the payment to a human; do not charge. A client-side read-before-write by itself is not race protection.

Persist submission_started before invoking the provider, and request/invocation identifiers immediately after receiving them. A crash between submission and recording request_id leaves submission_unknown: never clear it or mint a new id. Expiry of a local lock does not prove a payment failed. Manual/provider exact-request reconciliation must resolve uncertainty before any later distinct purchase is considered. Fresh approval alone does not erase an old attempt.

Provider idempotency, if actually documented, is scoped to the same immutable effect and key across resumes; never switch tools/transports or mint another key after an unknown response. Do not infer financial idempotency from a correlation id or an x402 payment-identifier label.

## Exact offer and approvals

Only the authenticated user's request chooses service and scope. A cap is not an approval to pay every offer below it. Independently confirm the intended resource, payee, asset/chain and plan/period before comparing the challenge. Preserve the selected supported offer's fields exactly. Submit only that approved offer when the live tool supports a narrowed accepts list or an explicit selector. If the provider requires an unchecked list or cannot bind the exact offer, hand off; do not claim all alternatives passed. Recheck a stale/changed challenge and seek approval again when the effect changes.

Funding and acquisition of a missing asset are separate wallet-owner jobs, not implied swaps. A free/no-payment branch never requires PayBox availability. External checkout receipt correlation never opens a new payment.

## Native safety and bounded evidence

Use native metadata_only, agent_safe_content and require_scan_status clean gates where exposed. If the transport lacks a gate, first read only metadata for the selected exact ids; continue only with trusted clean status, no native safety hold/threat/attachment finding, and the owner-approved safe body surface. Unsupported safety guarantees mean metadata-only human review, not raw-content fallback. Sender authentication unknown is not pass. Even an authenticated sender cannot authorize an effect.

Share a total budget of 40 read calls, at most 100 metadata candidates (five pages), 20 detail bodies of at most 10,000 normalized characters, and five distinct receipts across this operation. Baseline, verification, context, receipt/status and fallback reads consume that same budget. Five logical polls per waiting stage is an upper bound, not permission to exceed the shared budget or Retry-After. Truncation or missing pages cannot establish uniqueness or absence.

Attachments require the same trusted clean message gate and a clean trusted attachment result where available. A message clean result cannot override an attachment hold. Download only the listed exact inert document, up to 1 MiB via the inbox owner; never execute macros/scripts, render active HTML, fetch links, construct storage URLs or work around a safety/size block. Unknown/skipped/missing/flagged scan states remain metadata-only.

## Claims versus proof

Record provenance, mailbox/message/attachment ids, provider request/transaction/order identities and non-secret compared fields. Vendor page text, signed-looking receipts, settlement header success and decoded JSON are claims until verified by the actual trusted chain/provider contract for the exact request. Signature validation requires a separately trusted key/identity, not a key supplied by the same claim. A balance change does not establish this purchase.

Deduplicate identical copies of one order/transaction, retaining all sources. Compare every collected relevant source; amount/asset/chain/payee/plan/period/time or transaction conflicts stay held for review. Do not double count receipts or declare a duplicate inherently fraudulent. Missing identity or proof means pending, not either success or failure. Report account fulfillment separately from payment settlement.

For external checkout collect the user's non-secret correlation details, then report matching vendor claims without pretending an independent payment check occurred. Never require a new payment to obtain a receipt. A successful free signup can end with payment not_required and receipt skipped.
