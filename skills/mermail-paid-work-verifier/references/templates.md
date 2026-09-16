# Job and verification templates

These are blank structures for owner-authorized runtime use, not records to fill in this repository. They define an assisted workflow checkpoint, not an API schema or database. Required verification fields must carry evidence or an explicit unresolved state.

## Private owner job record

| Group | Record |
| --- | --- |
| Identity | Owner verifier and verification time; client/account ID; approved client addresses; workspace ID; mailbox `public_id` and address; thread ID; selected inbound email ID |
| Job | Owner job ID; deliverable description and format; scope boundary; deadline/timezone; agreed price, asset, chain, and payment schedule (deposit, milestones, final) |
| Payment terms | Expected amounts in integer smallest units per stage; expected sender reference if known; authorized wallet/credential reference (no secrets); verification time |
| Baseline | Holdings snapshot per asset/chain recorded before the claimed payment, with read time and tool used |
| Claims | Each client claim: source message ID, claimed amount/asset/chain, quoted transaction or escrow reference, claim time, ladder state (`claimed`/`unverified`/`pending`/`verified`/`settled`), evidence source |
| Ledger | Confirmed received, pending, and unresolved amounts per stage; remaining balance due; last reconciliation time and tool |
| Delivery | Deliverable version; source email/thread; draft ID; approved sender/To/Cc/Bcc; authorized attachments; exact approval reference; returned message ID/status/time |
| Continuation | Latest processed inbound email ID; unresolved questions; evidence gaps; next permitted action; owner-authorized private persistence destination, if any |

Do not put private keys, signing credentials, payment proofs, signed URLs, raw provider responses, or unrelated client content in this record. A job or invoice identifier supplied by a client must match the owner's record before it is trusted.

## Clarification draft

Reply in the selected thread. Briefly restate the requested work and group only missing material questions: exact deliverable, scope boundary, price, asset/chain, payment schedule, deadline/timezone, and delivery format. State payment terms only as the agreed terms require; save as a draft pending exact send authorization.

## Deliverable note

- Title, deliverable version, and the agreed scope section it satisfies.
- The work product itself, self-contained in the body unless an attachment was explicitly agreed and the live schema supports it.
- Material limitations, assumptions, and open questions — never padded to look complete.
- No internal billing evidence, wallet state, ledger entries, or verification details in client-facing output.

## Scope-change draft

Identify the existing verified job, the newly requested work or milestone, and the repriced terms as a proposal. State that work continues only after the owner approves the revised terms and the new payment evidence verifies. Save as a draft; do not begin the expanded scope.

## Private end-of-run checkpoint

Return the job ID, state, source email/thread, deliverable version, and draft/message identifiers; completed work; each claim's ladder state and evidence source; confirmed, pending, and unresolved ledger amounts; and the next action requiring owner input or already authorized. Do not claim a checkpoint was persisted unless the authorized destination confirms the write.
