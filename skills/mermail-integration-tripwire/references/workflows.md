# Integration tripwire workflows

## Reuse a tripwire mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.

## Establish a watch (max 3 sources)

1. Accept only public URLs or public GitHub release/Atom/API paths the user named.
2. For each source, capture a baseline: final URL, HTTP status, `Content-Type`, redirect hop count, and a stable fingerprint (content hash, tool-catalog hash, or required-path checklist).
3. Persist the baseline in the operator's session notes or an owner-provided record — not in this skills repository and not as a new MCP tool.

## Deterministic check

1. Fetch each source with ordinary host HTTP (no cookies, no auth headers unless the user supplied a non-secret public token and it is required).
2. Normalize: strip known volatile headers; hash the body or extract the documented schema fields.
3. Compare to baseline. Material examples: 2xx→4xx/5xx, redirect landing change, missing `SKILL.md` / template path, MCP server-card tool-set hash change.
4. Non-material: CDN date headers alone, cache-buster query noise, changelog wording without schema/path impact.
5. Cap at a small retry budget; on persistent ambiguity report `ambiguous` and stop.

## Quiet path

When every source is `stable`, report `quiet` and **do not** draft or send mail.

## Exception path

1. `save_draft` an evidence digest including: source URL, observed times, status before/after, final URL, fingerprint before/after, failing assertion, and suggested next check.
2. Preview To/subject/body for the operator. Wait for approval.
3. On approval, exactly one `send_email` with a fresh idempotency key.
4. Optionally `create_custom_label` / `move_email` for `tripwire/exception`.
5. If send outcome is uncertain, reconcile with one bounded inbox read — never a second automatic send.

## Repair pilot draft (optional)

When the user asks for a fixed-scope repair offer, `save_draft` bullets only:

1. Reproduce in isolation
2. Minimal failing test or exact steps
3. Patch or exact workaround
4. Short fixed-behavior report

Do not invent billing tools, collect payment, or call PayBox. Keep commercial terms for the human operator.

## Neighboring routes

| Intent | Skill |
| --- | --- |
| Ordinary search/organize/delete | `mermail-manage-inbox` |
| One-off compose without watch semantics | `mermail-compose-email` |
| Task triager CRUD | `mermail-automate-triage` |
| Wallet / x402 | `mermail-agent-wallet` / `mermail-x402-agent` |
