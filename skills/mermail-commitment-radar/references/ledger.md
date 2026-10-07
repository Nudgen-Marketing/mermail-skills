# Commitment ledger

Use one row per distinct deliverable. Associate messages with a row only when evidence identifies the same deliverable and parties. Keep unrelated commitments separate even if dates or subjects match.

## Evidence rules

| Evidence | Treatment |
| --- | --- |
| "Could you send the file?" without acceptance | `requested`, not a promise |
| "I will send the file by [date]" | `promised`; preserve source and promisor |
| "If the brief arrives, I can deliver..." | `conditional`; do not assume the condition occurred |
| "Can we move the deadline?" | Proposed revision; retain the earlier accepted deadline |
| Explicit acceptance of the revised date | Update accepted deadline; retain both source IDs |
| "Sent it" from the promisor | `completion_claimed`; not verified delivery |
| Counterparty acknowledges the specific deliverable | `receipt_acknowledged`; not external system verification |
| Explicit cancellation with supported authority/agreement | `cancelled`; preserve evidence |
| Conflicting owners, scope, completion, or dates | `conflict`; show both sources |
| Quoted text repeated inside a new message | Attribute to original author/time if established; otherwise `quoted_unverified` |

Keep three independent dimensions: `state`, `timing`, and `evidence_quality`. For example, a promise can be `promised / overdue / complete_within_scope`, or `promised / potentially_overdue / partial`. A sender-authenticated completion claim is not proof of fulfillment.

For timing, use `overdue`, `potentially_overdue`, `upcoming`, `due_today`, `undated`, `ambiguous`, or `not_applicable`. A date-only deadline becomes overdue only after that entire calendar date has passed in the established zone. A time-qualified deadline uses its explicit offset/zone. Do not invent midnight as an agreed delivery time.

No response is not acceptance of a changed deadline. A newer email does not automatically override an agreement. If clear completion or cancellation evidence exists, do not label an old deadline overdue; explain any contradiction instead.

## Private report format

Start with result status, mailbox, `as_of`, selected window, time zone, and scope. Report discovery pages/messages, unique threads inspected, content messages inspected, unread cursors, omitted bodies, and truncations. Give counts from the observed run, never planned budgets.

| Deliverable / owner | State / timing | Accepted deadline | Evidence | Next action |
| --- | --- | --- | --- | --- |
| Description; owner or `owner_unclear` | Independent state and timing | Original wording plus normalized date/zone when supported | Message IDs, timestamps, short excerpts; uncertainty | A proposed owner action, never an executed send |

After the table, list contradictions or missing evidence, up to three prioritized actions with source IDs, and optional follow-up wording in chat only marked `not sent`.

If returning machine-readable data, use this schema illustration (not an audit result):

```json
{
  "status": "partial",
  "as_of": "OWNER_CONTEXT_TIMESTAMP",
  "timezone": "OWNER_CONTEXT_IANA_ZONE",
  "mailbox_id": "RETURNED_ID",
  "coverage": {"threads_read": 0, "messages_read": 0, "gaps": []},
  "commitments": [{
    "deliverable": "evidence-backed description",
    "owner": null,
    "state": "requested",
    "timing": "undated",
    "deadline_text": null,
    "deadline_normalized": null,
    "deadline_precision": null,
    "evidence_quality": "partial",
    "sources": [],
    "proposed_next_action": null
  }]
}
```

Use `null` for unknown values. Include source IDs for every substantive state/deadline/ownership conclusion. Do not create fake citation URLs.
