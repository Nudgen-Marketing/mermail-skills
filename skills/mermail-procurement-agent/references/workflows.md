# Workflows

Read [state-and-evidence.md](state-and-evidence.md) before any external effect or resume. The skill owns no durable store, checkout API or financial idempotency primitive.

## Choose stages first

| User's task | Payment scope | Authentication / wallet |
| --- | --- | --- |
| Free trial, signup and verify, or verification only | not_requested / not_required | API key or agent-inbox profile is sufficient for permitted mailbox work; no PayBox probe |
| Signup with a specifically requested paid plan | requested | Full-profile OAuth wallet owner contract, readiness before consequential signup |
| User already checked out elsewhere; find receipt | external_checkout | Read-only correlation in the bound mailbox; no PayBox probe or new payment |
| Isolated wallet action | out of scope | Route to mermail-agent-wallet |
| Paid resource only to continue an existing job | out of scope | Route to mermail-x402-agent |

Freeze workspace, service origin, plan/period and stage scope. Record skipped stages explicitly.
A cap is a ceiling, not exact-charge authorization. A trial that silently starts recurring billing is not a free/no-payment branch: stop for human review of the commitment.

## Mailbox, signup and verification

1. Resolve workspace and service-scoped mailbox using the inbox owner. Discover before provisioning; exact address, purpose and receive readiness must match. A create needs address/credit preview and one approved call. Unknown creation is followed by bounded exact-address lookup, not another create.
2. Before triggering signup record the verification baseline ids, exact recipient, expected sender/domain, subjects, UTC start and deadline. A resumed operation reuses its checkpoint; no new signup because polling timed out.
3. Use the available host browser under [browser.md](browser.md). Human credentials, consent, CAPTCHA or policy blocks are handoffs, not failed Mermail stages.
4. Metadata-first polling is bounded to five logical attempts per stage. Preserve native safety gates, including held-mail access only if allowed by the native owner. Reused standard inboxes can hold vendor mail for five minutes; a short absence is not proof of non-delivery.
5. Exactly one post-baseline candidate with expected tuple, trusted clean safety status and sender authentication passes to one bounded safe body read. Ambiguity stops; unknown/flagged/safety-held content remains metadata-only. Fresh approval is required before OTP/link use, without preflight.
6. No payment requested: report verification/account result and payment not_requested/not_required. No receipt promised: receipt skipped. An unexpected paywall does not authorize a payment or OAuth upgrade.

## Requested payment

1. Resolve the existing durable logical intent before creating any new operation id. Reserve the exact effect using the selected store's real atomic or enforced exclusive-writer contract.
2. Get wallet readiness before signup when a paid plan is known to be required. Missing connection is a paid-stage handoff; free or external-receipt work is unaffected.
3. Resolve the quote and independently confirmed resource/payee/asset/network. Compare with cap using exact units. For x402 use [tools.md](tools.md#readonly-comparison-contract); a supported single selected offer only. A changed offer or unsupported version/scheme stops for review.
4. If a genuinely known asset shortfall exists, offer a separate funding or asset-acquisition task through the wallet owner. A swap needs its own exact approved asset pair, chain, amount/slippage and fees. It is not implied by payment approval. After completion reconcile it and re-read holdings/quote; never automatically chain swap to pay. Unknown holdings are not zero.
5. Preview the exact charge, connection, selected offer, resource/request, payee, plan/period and any recurring obligation. Approval binds that version only. Persist submission_started before the one call; this records uncertainty, not settlement.
6. Pending signing: one returned handoff, then stop. On a later user status request reconcile the known request once. Missing request id, timeout, malformed or uncertain response remains unresolved and blocks replacements across restarts.
7. Proof creation is not redemption or settlement. Redeem the frozen supported request once under the x402 owner contract; secret proof stays protected. No changed destination/method/body, unknown redemption replay or second proof generation.
8. Reconcile account fulfillment and evidence independently. No real settlement is claimed by these offline instructions/tests.

## Receipt-only and reconciliation

For external checkout first ask the user for non-secret order/transaction identity, vendor/plan, amount/currency, account and time window if needed. That assertion selects correlation scope; it is not chain proof. Search the bound mailbox and inspect clean candidates only. If multiple orders fit, return ambiguity without guessing or opening payment.

Collect at most five distinct candidate receipts and one inert attachment per selected clean message within the inbox owner's 1 MiB limit and shared read budget. Copies can all describe the same charge; deduplicate by stable order/transaction plus business fields, retain provenance. Compare all collected channels together; a conflicting email/attachment/provider claim cannot be overridden by choosing the first favorable source. Metadata-only blocked evidence remains pending.

Report separately:
- vendor receipt found / matching claim;
- exact-request independent settlement known / unknown;
- plan/account fulfillment confirmed / pending;
- field mismatch / source conflict.

Only complete required evidence permits receipt_verified. Missing evidence is receipt_pending, not failed payment. Conflicts are receipt_mismatch, never corrective payment. For upto, settled zero is valid only with independent exact-request/no-usage evidence. A destination balance alone cannot identify the payer, invoice or transaction.

## Filing and final deliverable

Evidence delivery defaults to exact mailbox/message/order identifiers, not a write. An owner-requested folder move is separately previewed with exact message and target folder; inspect existing folders before optional approved creation. No label-attachment tool exists; future label rules are separate admin work. Do not delete or send the default triager's draft.

Return a compact Signup receipt:
- procurement_id and resumed/new checkpoint;
- workspace, service/plan/period, mailbox/public_id (reused/provisioned);
- mailbox → signup → verification → payment → receipt states in that order;
- payment not_requested / not_required / external_checkout / awaiting_approval / pending_signature / uncertain / independently_settled;
- approved terms and known request id, or n/a;
- receipt provenance, claim versus independent settlement, mismatching fields;
- completed/skipped/pending/blocked stages and exact remaining human action.

Do not persist OTPs, bearer URLs, proofs, credentials or customer secrets in that report.

## Renewals and recovery

A genuine new period/purchase requires a fresh authenticated intent and envelope, with an explicit relation to the old operation. Do not mint a new id to bypass an unresolved charge. Cancellation, refund, dispute, credentials, recurring enrollment and destructive cleanup require their own owner workflow; this skill does not infer those permissions.
