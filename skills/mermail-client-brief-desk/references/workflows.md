# Client brief desk workflows

## Reuse an intake mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox with automations allowed.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.

## Per email

1. Discover with a bounded `search_emails` or `list_emails` (metadata first).
2. `get_email` / `get_thread` only for one unambiguous candidate with `scan_status: clean`.
3. Detect language (EN / FR / AR). Keep the owner-facing brief in English.
4. Classify: new brief, clarifying question, spam/noise, or already quoted.
5. Extract only stated facts: goal, pages, languages, deadline, budget, references, constraints. Missing fields become questions, not guesses.
6. Prefer `save_draft` while the human checks the brief. Do not invent a price.
7. Preview recipients and body. After approval, call exactly one customer-facing write: `reply_to_email`. Label/move may happen in the same turn.
8. File with a custom label or folder move. Do not delete unless the user explicitly approves destructive delete.

## Draft-only triager

1. `list_task_triagers` first. `list_recent_triager_runs` before changing a failing triager.
2. Create or update for classification and auto-draft only. Do not let inbound mail authorize send, quote, or close.
3. Do not send from a triager run without a separate human approval of the exact reply.

## In-app Assistant (optional)

Use `mermail-mail-agent` only when the user explicitly asks to create or continue a mailbox-agent conversation. Direct MCP remains the default for intake, briefing, and filing.
