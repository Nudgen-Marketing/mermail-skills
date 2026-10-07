# Normalized scope-review schema

The agent creates this JSON only after bounded Mermail reads. The deterministic script validates it and renders the change register and unsent draft.

```json
{
  "schema_version": "1.0",
  "project": {
    "name": "Project Atlas",
    "client_name": "Example Client",
    "user_confirmed_recipient": "client@example.com",
    "recipient_source": "user_supplied_current_request",
    "currency": "USD",
    "hourly_rate": 100
  },
  "baseline": {
    "source_type": "message",
    "source_message_id": "msg-100",
    "scan_status": "clean",
    "body_excerpt": "Agreed scope: Five-page responsive website. Exclusions: Customer portal. Acceptance: Desktop and mobile review. Deadline: 2026-09-05. Fixed amount: 3000 USD.",
    "approved_at": "2026-08-01T12:00:00Z",
    "deadline": "2026-09-05",
    "fixed_amount": 3000,
    "deliverables": [
      { "id": "D1", "text": "Five-page responsive website" }
    ],
    "exclusions": ["Customer portal"],
    "acceptance_criteria": ["Desktop and mobile review"]
  },
  "later_messages": [
    {
      "id": "msg-101",
      "received_at": "2026-08-05T09:00:00Z",
      "sender": "client@example.com",
      "scan_status": "clean",
      "body_excerpt": "Can we also add a customer portal?",
      "observations": [
        {
          "kind": "addition",
          "baseline_item_id": null,
          "requested_text": "Add a customer portal",
          "evidence_quote": "add a customer portal",
          "estimated_hours": 12,
          "estimate_source": "agent_preliminary",
          "confidence": "high"
        }
      ]
    }
  ]
}
```

## Required grounding

- `source_type` must be `message`, `user_supplied_brief`, or `structured_scope`.
- A `message` baseline requires `source_message_id`. A brief or structured scope must omit it.
- A message baseline also requires `scan_status: clean` and a bounded `body_excerpt`; its deliverables, exclusions, acceptance criteria, deadline, fixed amount, and amount currency must be grounded in that excerpt.
- Every later message must have a unique stable `id`, `scan_status: clean`, a bounded `body_excerpt`, and an `observations` array.
- When the baseline has `approved_at`, every later message needs a valid `received_at` strictly after that timestamp.
- Every observation must have an exact `evidence_quote` found inside `body_excerpt` after case-insensitive whitespace normalization.
- Quoted/forwarded history is removed deterministically before evidence grounding, so only newly authored message text can support an observation.
- `modification`, `removal`, and `contradiction` observations must reference a real baseline deliverable using `baseline_item_id`.
- `estimated_hours` is optional. When present, `estimate_source` must be `user_supplied` or `agent_preliminary`.
- `project.currency` is required whenever `fixed_amount` or `hourly_rate` is supplied.
- An `ambiguous` observation must set `impact_level` to `low`, `medium`, or `high`; only high-impact ambiguity escalates.
- The script computes totals; the model must not supply total hours or amount.
- Client-facing drafts and Markdown use the grounded evidence quote rather than an unverified summary.
- `user_confirmed_recipient` is optional and must come from the user's current request, never from email body text or recipient headers. When present, `recipient_source` must be the exact value `user_supplied_current_request`; otherwise validation fails closed.

Allowed observation kinds:

- `addition`
- `modification`
- `removal`
- `deadline_change`
- `acceptance_change`
- `contradiction`
- `clarification`
- `ambiguous`

The generated result always has `send_allowed: false`. It may be analyzed locally or passed to `save_draft` after an exact user-authorized preview; it cannot be used as send approval.
