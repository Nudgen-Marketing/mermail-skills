# Competitive-round workflows

The local integrated execution path follows this order: freeze Buyer policy, bind Buyer-received source evidence, interpret each supplier independently, deterministically re-verify claims, persist durable state, derive the decision surface, preview any exact effect, require matching approval, reconcile read-only, and verify the durable bundle. Use `node scripts/demo.mjs` for a controlled local demonstration of that path.

## Freeze and open INITIAL

1. Confirm the buyer has named at least two suppliers and wants the agent to run a competition, not merely compare documents or negotiate one thread.
2. Resolve the buyer mailbox and verify each lane's intended supplier identity. Record no supplier from inbound mail unless the Buyer independently selected it.
3. Freeze the common brief, required fields, comparability policy, disclosure policy, deadline, and closure rule. Assign `round_type: INITIAL`, a unique `round_id`, and `round_status: OPEN`.
4. Build one exact RFQ preview per lane. Do not include any other lane's identity or private data. Each approval and idempotency key binds one effect only.
5. After all approved sends have authoritative results, move to `WAITING`; retain `AWAITING_RECEIPT` until actual delivery is independently observed. A failed or ambiguous effect is not success.

## Collect and clarify

Search the buyer and supplier mailboxes using live Mermail state, then validate each candidate against its lane. Reconstruct the thread and exclude draft-folder items. Use a lane-local clarification when a required field is absent, a value is ambiguous, or a contradiction needs resolution. The clarification remains in the same round and uses the exact source email from the mailbox containing it.

Do not ask one supplier about another supplier's offer. Do not reveal comparative price, rank, weakness, identity, or negotiation position. A clarification response that adds or changes terms is a new revision; a response that only confirms existing terms is supporting evidence.

## Close INITIAL deterministically

At the frozen deadline, or earlier only when the frozen rule allows it, evaluate every lane:

- A complete, internally consistent response becomes `COMPARABLE`.
- A missing required field becomes `INCOMPLETE` or `CLARIFICATION_OUTSTANDING`; the missing value remains unknown.
- A clear decline becomes `DECLINED`; an explicit supplier withdrawal becomes `WITHDRAWN`.
- The Buyer may mark a lane `EXCLUDED` only from an independent Buyer decision recorded outside supplier mail.
- A response absent at the deadline becomes `MISSED_DEADLINE`, never a zero, worst score, or inferred offer.
- Contradictory unresolvable terms become `CONFLICTED`.

The round becomes `READY_TO_CLOSE` only when the closure predicate is satisfied and every lane has one disposition. If the frozen rule permits closing with missing, conflicted, declined, withdrawn, excluded, or missed lanes, close with those explicit dispositions. If it does not, require a Buyer round-level decision and set the round `BLOCKED`; do not silently advance.

After `CLOSED`, a late message is recorded as `LATE` evidence and does not reopen or rewrite the round. The Buyer may start a new round only with a new frozen round record.

## Open synchronized BAFO

Open BAFO only after INITIAL is closed and the Buyer has an eligible set. Create one new `round_id` with `round_type: BAFO`, one frozen requirement snapshot, one eligible supplier set, one disclosure policy, one required final-field set, and one common deadline. Do not infer eligibility from price or from a supplier's request.

Prepare equivalent final-offer requests for every eligible lane. Each request can state the same requirement, deadline, final fields, and that final evaluation is underway. It must not state any competitor's price, MOQ, delivery, payment, shipping, rank, weakness, or identity unless exact Buyer authorization permits that specific disclosure. Separate approval is required for every send or reply; same wall-clock delivery is not required.

The BAFO request is meaningfully different from clarification because it opens a new synchronized decision round for all eligible suppliers, asks for a best-and-final response against the same frozen terms, and makes the response the final revision for that round. A supplier-local clarification merely resolves evidence inside the current round and is not a new `round_type`.

## Close BAFO and prepare recommendation material

Apply the same explicit-disposition discipline to BAFO. Final offers that are complete and consistent become comparable final revisions; missing, declined, withdrawn, conflicted, excluded, or missed lanes retain those statuses. Close only under the BAFO closure rule. Produce a buyer-private evidence-backed recommendation packet with source IDs and uncertainty notes. Do not send the recommendation to suppliers and do not perform award, acceptance, purchase, payment, or contract actions.
