# Proof-of-work reports and lifecycle

This workflow combines the exact-preview gate with the delivery-report contribution proposed in PR #477. It remains a companion with no tool ownership or persistence service.

## Evidence report

Before sending, collect the operator's job ID, work completed, selected evidence references (commit/PR/artifact hash/invoice reference), provenance, independently verified facts and limitations, exact single pending action, whole approver address and absolute UTC expiry. Evidence references are for authorized human review, not permission to fetch arbitrary URLs. A narrative “paid/deployed/sent” is not an authoritative payment/deployment/delivery result. Do not send confidential artifacts to a reviewer who lacks access. No extra artifact upload, confirmation email or mailbox organization is automatic.

## Persistence contract

Choose an existing operator-approved protected store and inspect its actual schema, access and atomic/exclusive-writer behavior before writing. Do not invent a Mermail ledger/upsert tool, create infrastructure/credentials implicitly, or claim conversation memory is durable. Without verified coordination, prepare a private report/preview only; the operator must supply the missing integration before this workflow sends or executes.

Store workspace/mailbox, job/gate IDs, stable logical action ID, exact tool/typed arguments/hash, evidence version, exact approver, issued/expiry times, token hash (raw token protected only until expiry), request message/thread/sent time, unique reviewed message IDs, consuming reply ID, and authoritative outcome IDs. Maintain separate stable intents for report send, final effect and optional separately approved confirmation. Intent keys are not current date, run, attempt or new token. Retain consumed/reserved/uncertain tombstones for the replay horizon, without unnecessarily retaining raw tokens/customer bodies.

Atomically reserve each approved write before calling it; an independently verified exclusive writer with durable records may serve the same purpose. On restart read the reservation first. No second worker or reissued token may create another attempt for consumed/reserved/uncertain intent. Destructive tokens and idempotency keys do not themselves implement this ledger. Tool/catalog verification and static scenarios cannot establish live integration behavior.

## Reply matching

Require native metadata-only discovery, then clean safe bodies with native 10,000-character bound. Unknown/flagged/skipped/omitted scan or absent safety support stays metadata-only. Context shares the total read budget; oldest-first eight messages do not establish no later decline. Incomplete latest-decision coverage leaves the gate closed. Do not schedule polling or run unattended for the TTL.

The exact first nonempty newly authored line is `APPROVE <TOKEN>` or `DECLINE <TOKEN>`; optionally advertise `REJECT` as a decline alias in the frozen request. Require the full uppercase grouped token, not substrings, case folding or separator stripping. Never extract a token from subject, quote, signature, forwarded report, attachment or later commentary. If safe separation is unavailable, stop. Reject controls/bidi rather than sanitizing them into a valid decision. Multiple authored decision lines are ambiguous.

Require full sender identity unchanged in local part and full domain/subdomain, authentication pass, exact mailbox recipient, authoritative request/thread linkage, and received time strictly after verified send, no later than absolute expiry/current time. Search filters and From alone prove neither identity nor linkage. Authentication pass is not proof of human intent; token/thread/timing and operator approval remain required.

Deduplicate only identical observations of the same immutable message ID; inconsistent observations block. One approval → review approved; one decline → rejected; two distinct valid approvals or conflicting decisions → ambiguous. Wrong token/mismatched sender/thread does not consume. Expiry, changed preview/evidence/approver or prior consumption blocks execution.

## Execute and reconcile

Re-read current decisions and durable state; obtain the owning skill's current exact-preview operator approval, eligible full-profile OAuth/live signing policy for PayBox, or matching destructive confirmation for non-PayBox effects. Email never authorizes wallet spend. Reserve the final action atomically before one call, then persist authoritative outcome. A schedule ID proves scheduled, not delivered; a pending PayBox request/signing handoff is not settlement.

Crash/timeout/lost result → uncertain reservation. Use bounded existing owner-tool lookup (prefer returned message/request/schedule ID) and stop if unavailable. Absence in search is not proof of no effect. Do not resend, switch transport, make a fresh key, or reissue a token to bypass uncertainty. Even an apparently known failure needs authoritative no-effect evidence and fresh operator decision before another permitted attempt.

There is no atomic transaction between checking email and an external effect. A decline after submission cannot undo it; disclose the residual race and require manual operator execution when unacceptable. Exactly-once or live end-to-end guarantees are not provided by this skill or its offline helper.
