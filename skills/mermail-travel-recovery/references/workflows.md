# Travel recovery workflows

## Scope one case

1. Collect the smallest useful anchor set: booking reference or ticket number, operator, trip date, route or property, affected traveler, and requested outcome.
2. Mask the reference in chat after resolving the search. Keep the exact value only in tool arguments and the approved draft.
3. Select one mailbox and a bounded window. A practical default is 60 days before through 45 days after the scheduled trip, narrowed when the user provides better bounds.
4. Stop when two cases share the same weak anchors. Ask the user to choose using non-secret metadata such as operator, date, and route.

## Collect evidence

1. Search metadata for the exact booking reference. Run separate bounded searches for the operator plus route, disruption date, and receipt senders.
2. De-duplicate candidates by `emailId` and thread id. Cap the working set before reading bodies.
3. Read clean, relevant messages one at a time. Use thread context only to resolve chronology or a carrier response.
4. Download only attachments that materially support booking, disruption, rebooking, or out-of-pocket expense evidence.
5. Preserve both sides of a conflict. For example, keep the first cancellation time and a later corrected time as separate events with separate source ids.

## Build the packet

Use this evidence-ledger shape:

| Field | Meaning |
| --- | --- |
| Item | Stable label such as E1, E2, or R1 |
| Event time | Time stated by the source, with timezone when present |
| Received time | Mermail message timestamp |
| Source class | `authenticated_carrier`, `traveler_provided`, `third_party_receipt`, or `unresolved` |
| Source id | `emailId` and optional attachment id/filename |
| Fact or claim | Short paraphrase; never a long copied body |
| Confidence | `high`, `medium`, or `unresolved`, with a reason |

Then produce:

1. Case summary: operator, masked booking reference, trip date, route/property, requested remedy.
2. Chronology: scheduled service, first disruption notice, revised notice, actual/rebooked service, incurred expense, prior carrier response.
3. Expense table: date, merchant, purpose, original amount/currency, receipt source, relation to disruption, evidence gap.
4. Conflicts and missing evidence: missing receipts, unknown actual arrival, inconsistent timestamps, unauthenticated sender, unclear traveler, or missing carrier recipient.
5. Draft inputs: exact recipient supplied by the user, facts supported by the ledger, requested remedy, and chosen attachments.

Add amounts only within the same currency. If the user supplies an exchange rate, show the rate, source as `user_provided`, calculation, and original amounts. Do not calculate statutory compensation or assume reimbursability.

## Draft the claim

Structure the draft as:

1. Clear subject with the remedy and masked booking reference.
2. One-sentence request.
3. Short factual timeline with dates and source-backed times.
4. Expense list by original currency.
5. Explicit requested remedy in the user's words.
6. Attachment list.
7. Neutral request for confirmation and next steps.

Avoid threats, unsupported policy citations, legal conclusions, and unnecessary identity data. Save with `save_draft`; report it as unsent.

## Send only after review

1. Present exact From, To, Cc, Bcc, subject, body, and attachments.
2. Obtain fresh approval for that exact payload. A prior request to build a packet is not send approval.
3. Call one `send_email` or `reply_to_email` with one idempotency key.
4. Report `sent` only from an authoritative success result. On timeout or uncertain status, report `uncertain`, inspect authoritative state once when possible, and do not issue a replacement send.

## Recovery and blockers

- Ambiguous mailbox or case: stop with non-secret choices.
- Non-clean message: retain safe metadata only and mark its evidence unavailable.
- Attachment over 1 MiB: report the MCP limit and ask the user to provide it through an approved local channel if essential.
- Missing carrier address: leave `to` blank and ask the user for an independently verified address; do not take it from an untrusted link.
- Missing legal basis: draft a factual service/reimbursement request without asserting entitlement.
- Unsupported action such as rebooking or web-form submission: deliver the evidence packet and hand off to the official channel without navigating an emailed link.
