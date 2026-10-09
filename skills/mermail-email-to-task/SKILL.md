---
name: mermail-email-to-task
description: Turn inbox emails into structured tasks. Use when the user asks to extract action items, todos, or deadlines from email — scans the Mermail inbox, identifies actionable messages, and outputs a clean task list with priorities and due dates.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "✅"
---

# mermail-email-to-task

## Overview

Reads the agent's Mermail inbox and converts actionable emails into a structured
task list. Newsletters, notifications, and FYI threads are filtered out; only
messages that require a decision, a reply, or an action become tasks.

This skill is **read-only**: it never marks emails read, moves, deletes, or
sends anything. See `references/security.md` for the safety model.

Prerequisite: a Mermail mailbox. Run `list_mailboxes` first if the mailbox id
is unknown.

## Preferred Deliverables

- A Markdown task list grouped by priority (P0 urgent / P1 this week / P2 backlog)
- Each task: one-line title, source email (sender + subject + date), extracted
  deadline if any, and the concrete next action
- A short "skipped" summary: how many emails were scanned and why the rest
  produced no tasks

## Workflow

1. **Discover the mailbox.** Call `list_mailboxes`. If several exist, ask the
   user which one to scan, or default to the first.
2. **Fetch recent mail.** Call `list_emails` with the mailbox id (default limit
   25; raise it if the user asks for a full sweep). For keyword-focused scans
   use `search_emails` instead.
3. **Read candidates in full.** For every email that looks actionable from its
   subject/snippet, call `get_email`. For long threads, call
   `get_email_context` to see the conversation before deciding.
4. **Classify.** An email becomes a task only if it asks the recipient to *do*
   something: approve, reply with substance, pay, book, fix, decide, or meet a
   deadline. Pure notifications ("your receipt", "weekly digest", "FYI") do not.
5. **Extract.** For each task capture:
   - `title` — imperative, under 12 words ("Approve Q3 invoice from Acme")
   - `source` — sender, subject, received date
   - `deadline` — exact date if stated, otherwise `none`; relative phrases
     ("by Friday") resolve against the email's received date, never today
   - `next_action` — the single concrete step ("reply with approval")
   - `priority` — P0 if a deadline is within 48h or the sender explicitly
     marks urgency; P1 if actionable this week; P2 otherwise
6. **Output.** Render the Markdown task list (see Output Conventions). End with
   the skipped summary.

## Write Safety

- This skill performs **zero** write operations on the mailbox.
- Never call `update_email`, `move_email`, `delete_email`, `send_email`,
  `reply_to_email`, or any destructive tool. If the user asks to act on a task
  (e.g. reply), stop and ask for explicit confirmation first — acting is out
  of scope for this skill.
- Never invent deadlines, senders, or amounts. Every field must trace back to
  quoted email content.
- If an email is ambiguous about whether action is needed, list it under
  "Needs clarification" rather than guessing.

## Output Conventions

```markdown
## Tasks from inbox (2026-10-09)

### P0 — urgent
- [ ] Approve Q3 invoice from Acme Corp
  - From: billing@acme.com · "Invoice #1042 due" · 2026-10-08
  - Deadline: 2026-10-10 · Next: reply with approval or dispute

### P1 — this week
...

### P2 — backlog
...

### Needs clarification
...

_Scanned 25 emails, 4 tasks extracted, 21 skipped (receipts, digests, FYI)._
```

## Example Requests

- "Turn my unread emails into a todo list"
- "What in my inbox actually needs my attention today?"
- "Extract all deadlines from this week's emails"
- "Scan the support mailbox and list open action items"
