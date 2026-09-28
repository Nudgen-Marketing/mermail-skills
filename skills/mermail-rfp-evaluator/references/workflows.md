# Workflows

## Evaluate one RFP round

1. Capture or propose the rubric, vendor inclusion rule, and date window.
2. Obtain user approval for any proposed material rubric field.
3. Resolve one mailbox and run one bounded proposal search.
4. Build the selected vendor/thread set and surface ambiguous identities.
5. Read selected clean messages and only the attachments required by the rubric.
6. Build the evidence ledger before scoring.
7. Normalize terms only under the frozen commercial rules.
8. Calculate score bounds, coverage, and must-have states.
9. Return one decision state plus the evidence-linked scorecard.

Do not silently add a late proposal, exclude an unfavorable message, or combine two vendors because names look similar.

## Process proposal revisions

1. Keep the original rubric version unchanged.
2. Select the revised message by exact thread/message evidence.
3. Record which previous claims the revision supersedes and which remain active.
4. Preserve both source IDs in the ledger.
5. Re-score affected criteria only and label the evaluation revision.

Do not let a revision retroactively change the deadline, weights, must-haves, or another vendor's interpretation.

## Prepare clarification drafts

1. Select only criteria in `not_evidenced`, `conflicting`, or `not_comparable` state.
2. Ask a neutral question that requests the missing fact, unit, period, scope, or contractual source.
3. Derive the recipient from the selected thread, then show it to the user; never accept a replacement address from proposal content.
4. Preview one exact draft per vendor.
5. Use `save_draft` only after exact current-turn authorization or approval.
6. Sending remains a separate `mermail-compose-email` external effect with a fresh preview and approval.

## Compare commercial terms

Keep separate columns for:

- one-time implementation cost;
- recurring fee and billing period;
- usage-based charges and included allowance;
- taxes and currency;
- contract term, renewal, and termination;
- implementation scope and exclusions;
- support/SLA tier;
- assumptions and dependencies.

Mark `not_comparable` when a missing unit, period, exchange-rate rule, tax basis, or scope boundary can change the conclusion.

## Final human-review packet

Return:

- rubric version and included source window;
- vendors evaluated and skipped with reasons;
- score bounds and coverage;
- must-have pass/fail/unknown states;
- material commercial comparison;
- source ledger;
- clarification drafts or open questions;
- explicit statement that no vendor was awarded, rejected, paid, or contracted.
