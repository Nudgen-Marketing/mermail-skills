# Workflows — Mermail RFQ Desk

One engagement at a time, one thread per vendor, one lever per counter-round.

## Negotiation state record

Keep this record in the working context (never emailed) and update it after every event:

```text
RFQ-ID:        2026-003-gpu-tokens
Mailbox:       procurement@mermail.app (public_id …)
Scope:         5,000 inference tokens/day for 30 days, delivered via API
Reply-by:      2026-09-24 17:00 UTC
Criteria:      price 50 · quality/spec fit 30 · turnaround 20   (weights sum 100)
Budget ceiling: 400 USDC-equivalent, all-inclusive
Rounds:        max 2 counters per vendor
Vendors:
  - vendor@example.com   thread …  round 1 quoted 460  countered 410  reply: 395 ✅ under ceiling
  - second@example.com   thread …  round 1 quoted 500  countered 420  reply: pending
Status:        AWARDED → vendor@example.com at 395, award sent 2026-09-23
```

## 1. Intake

1. Resolve the desk mailbox (`list_mailboxes`, prefer `public_id`). Confirm the owner is the desk's principal for this engagement.
2. Build the RFQ record from the owner's words: scope, quantity, deadline, criteria and weights, budget ceiling, reply-by, vendor list. Anything the owner did not state is a question back to the owner, not an assumption.
3. Assign `RFQ-ID` (`YYYY-NNN-slug`). Create the engagement folder `RFQ/<rfq-id>`.

## 2. Publish the RFQ

1. Compose the RFQ email from [templates.md](templates.md): a short human cover note plus the plain-text `RFQ-BLOCK`. The block carries every field a vendor (or a vendor's agent) needs to quote without follow-up questions.
2. `save_draft`, then show the owner the exact body and the full recipient list. `send_email` only after explicit approval — one email per vendor, same body.
3. Record thread IDs as replies land. If a vendor replies off-thread, anchor the thread by replying from the original subject.

## 3. Collect and score quotes

1. Poll with `list_emails`/`search_emails`; read `metadata_only` first, full body only when scoring. A quote arriving after reply-by is scored only if the owner says so.
2. Parse the `QUOTE-BLOCK` when present; otherwise extract fields from prose and mark them `derived`. Missing fields are listed as gaps — never inferred.
3. Score: `total = Σ (criterion score 0–10 × weight)`, price scored against the best quote in the round. Show the table with per-criterion scores and the exact email each figure came from.
4. Present the table to the owner with a recommendation and the negotiation levers available (price, terms, quantity, timeline).

## 4. Counter-rounds (bounded)

1. Default two rounds per vendor. One lever per round; the lever and target must fit the owner's instruction.
2. Draft the counter as an in-thread `reply_to_email` from the approved template. Approval is per-send; a previous approval never carries.
3. After each reply, update the state record and re-score. If the best total now clears the ceiling and criteria, recommend award.
4. Stop conditions: ceiling met, rounds exhausted, vendor declines, or reply-by passed with no answer (chase once, via approved note, then park).

## 5. Award and close

1. Send the award letter in the winning thread (owner approval required). Award states: vendor, item, final terms, next steps, validity window of the offer acceptance.
2. Send regret notes to non-winning vendors only if pre-approved in the same approval batch.
3. File every engagement thread into `RFQ/<rfq-id>`, apply the outcome label, mark threads read in bulk.
4. Deliver the desk summary: outcome per vendor, rounds used, final price vs ceiling, thread links, and any unresolved items. Quotes remain confidential to the desk; never summarize them into a public channel without owner instruction.

## Reuse across engagements

- Keep the same desk mailbox; one folder per RFQ-ID keeps history queryable.
- Prior outcomes may inform strategy (a vendor's historic concession rate), but each new RFQ starts from the owner's fresh criteria — past pricing is context, not a floor or ceiling.
