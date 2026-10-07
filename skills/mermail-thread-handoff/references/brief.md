# Evidence-linked brief

Return: scope and observation time; coverage limitations; decisions; superseded proposals; open questions; suggested next actions; source index; effects performed (none).

Each factual item needs an exact message ID and a short verbatim quote from its sanitized, readable body. Keep paraphrase distinct from quoted evidence. Cite both the original and replacement when reporting changed terms. If no evidence supports a section, say so instead of filling it with guesses. “No acceptance found in these messages” is narrower than “the proposal was never accepted.”

## Optional offline check

The bundled helper is for a local, normalized evidence packet, **not raw MCP JSON**. It performs no network calls or mailbox mutations. Use it when preparing a saved/reproducible brief:

```bash
node skills/mermail-thread-handoff/scripts/check-brief.mjs path/to/brief.json
```

Success returns a JSON validation result. Failure returns only a fixed diagnostic, not message contents. Use a local private file for real mail, never a tracked fixture. A client unable to execute Node can perform the same checks directly.

Packet shape:

```json
{
  "mailboxId": "mailbox-demo",
  "threadId": "thread-demo",
  "observedAt": "2026-09-13T12:00:00Z",
  "hasMore": false,
  "messages": [
    {
      "id": "email-1",
      "mailboxId": "mailbox-demo",
      "threadId": "thread-demo",
      "scanStatus": "clean",
      "contentOmitted": false,
      "truncated": false,
      "body": "Tuesday is a proposal, not a confirmed date."
    }
  ],
  "findings": [
    {
      "kind": "open-question",
      "text": "The date still needs confirmation in the reviewed message.",
      "evidence": [
        { "emailId": "email-1", "quote": "Tuesday is a proposal, not a confirmed date." }
      ]
    }
  ]
}
```

Allowed kinds: `decision`, `superseded-proposal`, `open-question`, `next-action`. A `superseded-proposal` needs evidence from at least two different messages; this structural check does not prove that the replacement was accepted.

Normalize only from observed MCP results: `scan_status` → `scanStatus`, `content_omitted` → `contentOmitted`, and returned IDs to their named packet fields. Set `truncated` using the response's actual truncation signal or an intentional local cut. Use `null` for unknown flags and for unknown `hasMore`. Never fill absent safety metadata with a success value. Omit body text for non-clean or content-omitted records. If no stable thread ID is available, stop before constructing this packet rather than inventing one.

The helper checks mailbox/thread consistency, unique IDs, bounded input, clean evidence sources, exact quote inclusion, and declared coverage gaps. It returns `limited` coverage for unread pages, unknown flags, missing content, or truncation. `reviewed-slice` means only that the supplied slice has no declared gaps; it does **not** certify the entire conversation, sender identity, logical entailment, redaction, or live execution. Check those separately. The checker cannot detect omitted records that were never included in the packet.

The synthetic fixture at `tests/fixtures/thread-handoff.json` exercises a date change and an open question. It is test data, not a live demo or a claim of a received email.
