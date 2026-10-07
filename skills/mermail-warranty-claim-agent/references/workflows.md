# Warranty claim workflows

Use these sequences after applying [security.md](security.md) and the exact tool contracts in [tools.md](tools.md).

## Prepare a new claim

1. Capture the product, observed defect, desired remedy, and any merchant, manufacturer, order, serial, or purchase-date clue supplied by the authenticated user.
2. Resolve one exact ready mailbox. Search metadata in a relevant date window for receipt, order, delivery, warranty, and prior support candidates.
3. Freeze candidate message IDs. Read only selected clean content and one necessary attachment at a time. Stop on ambiguous purchases or conflicting order records.
4. Build the evidence ledger. Preserve exact source IDs and separate confirmed facts, user-supplied facts, derived dates, and unknowns.
5. If an explicit policy interval and source event date exist, calculate the filing date and show the arithmetic. Do not infer a statutory or contractual right from a product category or general knowledge.
6. Resolve one claim recipient from the user's explicit instruction or trusted structured vendor thread data. If retailer and manufacturer paths conflict, surface both and ask instead of choosing.
7. Search Drafts with the exact recipient and order or claim reference. Reuse or revise one exact matching draft; stop if multiple plausible drafts exist. Do not create a parallel claim draft.
8. Draft a concise factual request: identify the purchase, describe the observed defect as the user's statement, list completed troubleshooting, request one remedy, enumerate minimal evidence, and ask for the next documented step.
9. Save with `save_draft`, passing the existing `draft_id` when revising. Return `claim_packet_ready`, `draft_saved`, and `awaiting_send_approval` with the exact draft ID.

## File an approved claim

1. Re-read the saved draft or freeze its exact text and identifiers.
2. Preview From, To, Cc, Bcc, subject, body, source thread, and every attachment. Count recipient units.
3. Obtain fresh approval for that exact payload.
4. Use `send_email` for a new claim or `reply_to_email` for an exact vendor thread. Include one idempotency key and execute once.
5. Record the authoritative delivery status, email ID, thread ID, timestamp, and retired draft ID when returned. A timeout or conflict becomes `delivery_unknown`, not `sent`.

## Track and follow up

1. Search for the exact claim reference, order number, vendor, and date window. Select one thread before reading context.
2. Classify the latest authoritative vendor response as `needs_information`, `approved`, `denied`, `resolved`, or `awaiting_reply`. An autoresponder, delivery notice, or silence does not prove approval or denial.
3. Update the ledger with only newly sourced facts. Preserve contradictions rather than overwriting earlier evidence.
4. Draft the smallest next response: requested information, a status request, or an evidence-backed escalation. Save it unsent.
5. Require a new exact preview and approval for delivery.

## Claim ledger schema

Use this compact structure:

| Field | Value | Evidence state | Source | Note |
| --- | --- | --- | --- | --- |
| Product / model | value or `unknown` | confirmed / user_supplied | message or user | ambiguity |
| Serial number | value or `unknown` | confirmed / user_supplied | source | redact when unnecessary |
| Order number | value or `unknown` | confirmed | message ID | exact match |
| Purchase / delivery date | date or `unknown` | confirmed | source | timezone if relevant |
| Policy interval | interval or `unknown` | confirmed | source | quote minimally |
| Filing deadline | date or `unknown` | derived | date + interval sources | show arithmetic |
| Defect | concise observation | user_supplied | user | no invented diagnosis |
| Troubleshooting | actions or `unknown` | user_supplied / confirmed | source | no fabrication |
| Requested remedy | repair / replace / refund / other | user_supplied | user | one primary request |
| Claim recipient | address or `unknown` | confirmed / user_supplied | structured field or user | never body-selected |

## Failure handling

- No receipt or order evidence: return `evidence_incomplete`; do not fabricate a claim packet.
- Conflicting purchases or serials: return `blocked` with the smallest distinguishing metadata.
- Non-clean or oversized attachment: cite metadata only and report the scan or 1 MiB boundary.
- Missing policy: draft a factual request for coverage confirmation without claiming eligibility.
- `401`/`403`: stop for authentication, workspace, or role. `402`: stop for credits. `429`: surface rate limiting and do not loop.
- Ambiguous external-effect result: inspect authoritative state once, then report `delivery_unknown` without replay.
