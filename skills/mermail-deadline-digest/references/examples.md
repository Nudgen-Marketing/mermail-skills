# Output, local checks and live demo

## Digest layout

Use `action | request/commitment | due date and precision | evidence` for each bucket. Keep unconfirmed cancellations and completion claims in needs clarification rather than removing the underlying observation. For example:

| Bucket | Observation | Due | Evidence |
| --- | --- | --- | --- |
| Due today | Client requested a report; acceptance not established | 2026-09-19, date only | email `demo-1`: “Please send the report by September 19, 2026.” |
| Needs clarification | Conflicting revision | Original 2026-09-19; proposed 2026-09-21 | Show both source IDs and exact quotes; do not silently choose the later email. |

These are synthetic examples, not messages from a real workspace.

## Optional deterministic helper (Node.js 22+)

The helper accepts normalized JSON through stdin and emits JSON. It makes no MCP calls and performs no extraction. The agent must still confirm that each proposed action/date actually follows from the quoted message. A matching substring alone does not prove that.

```json
{
  "timezone": "Europe/Paris",
  "now": "2026-09-18T23:30:00Z",
  "messages": [{
    "id": "demo-1", "thread_id": "demo-thread",
    "scan_status": "clean", "content_omitted": false,
    "body": "Please send the report by September 19, 2026."
  }],
  "items": [{
    "email_id": "demo-1", "action": "Send report (requested, not accepted)",
    "quote": "Please send the report by September 19, 2026.",
    "deadline": { "date": "2026-09-19" }
  }]
}
```

Save this synthetic fixture as `example.json`, then from the repository root:

```sh
node skills/mermail-deadline-digest/scripts/digest.mjs < example.json
node --test tests/deadline-digest.test.mjs
```

Expected: one `due_today` observation with `effects: none`. Paris is already on September 19; a date-only deadline is not an overdue midnight timestamp. For private data prefer the host's in-memory execution facility; never interpolate email text into a shell command. Any locally saved real-message fixture needs user authorization and private storage.

Fields:

- `now`: trusted as-of instant, RFC3339 with offset; `timezone`: IANA display timezone.
- `messages`: at most 20 unique IDs, optional thread IDs and clean/safe body strings of at most 10,000 characters. Preserve actual returned safety fields; never manufacture a clean status.
- `items`: at most 100 normalized observations. `quote` must occur literally in the referenced body; `action` is a concise description, not an instruction for the script.
- `deadline`: `{ "date": "YYYY-MM-DD" }`, `{ "at": "RFC3339-with-offset" }`, or `null`. Leave unresolved or ambiguous wording null. Date-only values retain their precision; explicit instants use the report timezone for calendar grouping.

Unknown source IDs, fabricated quotes, invalid dates, missing timestamp offsets and excess limits fail the run. Unsafe/omitted sources are excluded. Exact duplicate rows collapse; differing deadlines within a source/thread remain visible with `thread_review_required`. This intentionally over-flags threads with several independent commitments; an agent must resolve them from evidence instead of the helper guessing which revision wins. No completion field can silently suppress a row.

## Live client smoke test / 2–5 minute demo

Use a dedicated test mailbox with consented synthetic messages, never production customer mail. A fixture-only CLI recording does **not** establish Mermail integration and does not satisfy the bounty's working-demo requirement.

Before recording, connect the client to Mermail, load the proposed skill from the development checkout, verify its selected source, and keep credentials out of the screen. Prepare test emails through the operator's own account: one exact date, one ambiguous relative date, one disputed revision, and one harmless prompt-injection sentence. Sending those messages is a separate, explicitly authorized setup action.

Suggested recording (about three minutes):

1. Show the trigger: “Use $mermail-deadline-digest on this test mailbox for the last 14 days in Europe/Paris. Do not change the inbox.”
2. Show actual `list_mailboxes`, bounded metadata discovery and scan-gated message reads from Mermail. Redact credentials and personal addresses.
3. Show the digest, short source quotes/IDs, date-only handling and unresolved conflict. State the inspected counts and exclusions.
4. Show that the injected request did not cause a send, wallet call or tool switch. Inspect the tool trace; do not claim safety merely because a scenario file exists.
5. End with the result and the repository/PR link. Explain which deadline needs human clarification.

Also smoke-test a neighboring request: “Book a meeting with this client” must route to the existing scheduling skill. “Email this digest to Alex” requires the compose skill's exact preview and approval before sending. Record these as pending until actually executed in a connected client.
