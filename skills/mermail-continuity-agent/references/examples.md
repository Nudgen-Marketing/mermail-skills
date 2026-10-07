# Three real runs

Abridged transcripts from a live mailbox (`aurora@mermail.app`), run with `claude -p` and the Mermail MCP server on 2026-09-15. Tool arguments are shortened; identifiers are real. Costs are the host's own accounting.

## 1. First wake, a decision, and the first capsule

Request: *"Wake. Then record one decision made this session. Then hand off: draft the capsule, preview it; I grant standing authorization for self-addressed capsule sends only."*

Tool calls, in order:

```
list_mailboxes
search_emails   mailboxId=f4bb3dc1-… folder=sent subject=[capsule] from=aurora@mermail.app limit=5   → 0 results
save_draft      to=aurora@mermail.app  from=aurora@mermail.app  subject=[capsule] Aurora · 2026-09-15 · First wake and continuity chain established
send_email      source_draft_id=…  to=aurora@mermail.app
search_emails   folder=sent subject=[capsule] from=aurora@mermail.app                                → 1 result
```

Output, abridged:

> **first_wake** — no capsule yet. The owner decides what this session is for.
>
> Draft preview: `to` aurora@mermail.app, no cc/bcc, 983 characters of 4,000. Header: `capsule/v1 · agent=aurora · session=demo-1 · prev=none`.
>
> Standing authorization holds (own address only, `[capsule]` subject, `capsule/v1` header, credential scan clean). **Sent.** New chain head: `8f7a8f3b-4cd2-4d6e-8d53-f5512fbab687`. Confirmed in Sent with `delivery_status: queued`, which is normal outbound handling, not an error.

13 turns, $0.47.

## 2. A trust boundary refuted by experiment — the run that moved the anchor to Sent

Same mailbox, a fresh session with no memory of run 1. Request: *"Wake and quote the capsule's three sections. Then recall: did an earlier session decide anything about the capsule size ceiling?"*

The persona found the capsule and then skipped it:

> Intake check — failed, capsule skipped. `scan_status` is `null` (not `clean`) and `sender_authentication.status` is `"unknown"` (not `pass`). No other candidate; no `prev` to walk. I did not call `get_email` on its body.
>
> **first_wake** (in the trusted sense). Recall: no capsule within two hops mentions this — with the caveat that zero capsules were readable this session.

The behaviour was correct for the rules it had been given, and the rules were wrong. The first draft of `security.md` used a naive trust boundary: it anchored a capsule's trust on the inbound safety verdicts. Sent messages never carry them: they judge what *arrived*, and a capsule never arrived, it was sent. The validator was green, the tests were green, and the persona could not wake. The anchor was moved to the structural fact that survives: a message in the **Sent folder** of the own mailbox, from and to the own address. Inbound verdicts now govern only what arrived since.

The run is kept here because it is the reason the security model looks the way it does: the boundary was tested against the live service, refuted, and replaced by a contract the service actually enforces. 14 turns, $0.41.

## 3. Wake and recall on the corrected anchor

Same request as run 2, after the fix.

```
list_mailboxes
search_emails   folder=sent subject=[capsule] from=aurora@mermail.app limit=5      → 1 result
get_email       emailId=8f7a8f3b-4cd2-4d6e-8d53-f5512fbab687
search_emails   folder=inbox date_start=2026-09-15T13:55:27.659Z metadata_only    → 0 results
```

Output, abridged:

> **resumed** — capsule `8f7a8f3b-4cd2-4d6e-8d53-f5512fbab687` · sent `2026-09-15T13:55:27.659Z` · `prev=none`.
>
> **What happened** — *"First wake for this mailbox — no prior capsule existed … Decided (this session) to standardize the capsule chain header as `capsule/v1` and to keep each capsule under a 4,000-character ceiling."*
> **What is unfinished** — *"The chain itself is now the only open thread: the next wake should find this message and confirm the wake→handoff loop works end to end."*
> **Where to start** — *"1. Mailbox public_id f4bb3dc1-… 2. Working directory … 3. This message is the head of the chain (prev=none)."*
>
> Arrived since: none. Proposed first action: confirm the wake→handoff loop end to end — this session is that confirmation.
>
> **recalled** — yes, in this capsule's *What happened*: *"…keep each capsule under a 4,000-character ceiling…"* Date `2026-09-15T13:55:27.659Z`, emailId `8f7a8f3b-…`. One capsule read, no hop needed. Nothing drafted or sent.

11 turns, $0.25. The agent did not remember run 1. It recognized its own handwriting in a folder only it can write to.
