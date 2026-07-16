---
name: mermail-compose-email
description: Draft, regenerate, send, reply to, forward, and schedule email through Mermail. Use when a user wants help composing email or asks Mermail to communicate externally, including AI-assisted drafts and scheduled delivery.
---

# Compose Mermail Email

Treat every delivery as an external side effect. Read [tools.md](references/tools.md) before choosing a composition workflow.

## Workflow

1. Resolve the mailbox and, for replies or forwards, fetch the exact source email.
2. Gather missing recipients, subject, content, attachment intent, and schedule time. Preserve the mailbox timezone for scheduled sends.
3. Prefer `save_draft` while content is still being revised. Use `regenerate_draft` only when AI regeneration is requested.
4. Present a final preview containing from mailbox, To/Cc/Bcc, subject, delivery time, and body summary.
5. Require explicit approval immediately before `send_email`, `reply_to_email`, `forward_email`, or `schedule_email_send` unless the same user message already unambiguously approves that exact payload.
6. Generate one idempotency key for the approved logical delivery and reuse it only for a transport retry of that identical payload.
7. Return delivery status and identifiers. Do not claim success from a draft response.

Never silently add recipients, change reply-all semantics, send regenerated text without review, or retry on an ambiguous timeout with a new idempotency key.
