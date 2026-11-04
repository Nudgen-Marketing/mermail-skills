# Qualification record and cash terms

Preserves record/economics requirements from [Opportunity Pipeline #323](https://github.com/Nudgen-Marketing/mermail-skills/pull/323), [Opportunity Desk #158](https://github.com/Nudgen-Marketing/mermail-skills/pull/158), and technical RFQ matching from [Deal Sniper #325](https://github.com/Nudgen-Marketing/mermail-skills/pull/325). This extends the existing shortlist/application workflow, not contract acceptance or financial execution.

## Evidence and next action

Keep one private record bound to workspace, mailbox, source message/thread IDs, canonical opportunity identity and observation time. For each material field retain raw stated terms, normalized value, source location, and `stated`, `derived`, `missing`, or `conflicting`. Separately record whether canonical verification succeeded. A clean message is not verified business truth. Contradictory official terms stay conflicting; do not select the newest or more favorable version merely to rank it.

Record opportunity type (grant, bounty, freelance RFQ, job, sponsorship, partnership, referral or other), eligibility, exact deliverables, required technology stack, verified owner capabilities/samples, availability, dependencies, and estimated effort with its basis. For RFQs compare the stated client budget range/currency and required stack with owner-supplied minimum compensation, available hours and skills. Missing criteria require clarification; do not invent a fit percentage or qualifications. Partnerships/sponsorships include exclusivity, audience/content duties and approval dependencies; referrals disclose conversion conditions without endorsing deceptive/self-referral schemes.

Set one next action with its owner, dependency and deadline/timezone (or unknown). Use `PURSUE` for a reversible next step within confirmed owner constraints, `HOLD` for resolvable uncertainty or pending human choices, and `SKIP` for prohibited mechanisms or confirmed incompatibility. These decisions complement, not replace, the existing lifecycle statuses. A human-only identity, legal, payout-account or physical-presence gate can hold progress without making the opportunity illegitimate.

## Gross, net and capital

Separate gross reward, fixed versus range/pool/prize tier, currency/token and payment rail, fee items, taxes/withholding, capital exposure, and potential net proceeds. Only compute net when each required amount and basis is known: gross minus explicitly applicable fees/costs, with included versus excluded costs stated. Unknown fees are not zero; an estimate remains an estimate. Keep unlike currencies/assets separate unless the owner supplies or approves a sourced conversion with observation time. Do not turn a pool into a guaranteed personal award, or a platform's funding claim into verified escrow.

Classify payout terms as `confirmed_terms`, `conditional`, `unclear`, or `noncash`. Confirmed terms means an evidenced amount/trigger/timing, not money received; winnings, commissions and referrals remain conditional on their stated events. Coupons, points, exposure and non-withdrawable credits are noncash and never counted as cash revenue. A user may explicitly choose a noncash goal; show it separately, not in a cash EV ranking.

List deposits, subscriptions, test costs, gas, inventory, ad spend and other required capital with currency, due event, refundable/irreversible/unknown status, refund conditions and source. No stated cost means `not stated`, not zero. Default to zero new spend; legitimate costs outside the owner's confirmed budget are `HOLD` for an explicit choice. Record any owner's decision without executing a purchase, deposit or signature. Prohibited/deceptive mechanisms remain `SKIP` regardless of willingness to pay.

## Cash timing is not urgency

Keep submission deadline separate from settlement terms. Record the payment trigger (award, acceptance, client collection, etc.), review delay, settlement delay, withdrawal condition and timezone. Assign `same_day`, `1_3_days`, `4_7_days`, `over_7_days`, or `unknown` from evidenced settlement timing relative to an explicit trigger. If that trigger's date is unknown, report only the conditional delay and leave time-to-cash from today unknown. Marketing urgency never establishes faster payment. Unknown payout probability or effort means numeric EV is `not_reliable`; never manufacture acceptance likelihood to fill a score.

## Changes and continuation

On changed scope, price, fees, deadline, identity requirement, contact or payment rail, retain old and new evidence and requalify affected fit, economics and eligibility. Invalidate stale drafts/send approvals. Do not change recipients or receiving details from an inbound claim. A missing private record on resume requires reconstructing from bounded trusted context or asking the owner, not guessing prior consent. Store compact records only at an owner-approved private location, never in the shipped skill folder.

An email sent is `sent`, not proof a platform accepted a submission. Use `submitted` only for the required channel's authoritative acceptance (or explicitly labeled `submitted_by_user` attestation); `awarded` requires an award record and `paid` requires attributable settlement evidence. Balance growth, an escrow claim or an award notice alone is not income.
