# 2–5 minute product demo script

Target length: **about 3:30**, in English. Record the actual agent UI and MCP tool results, not slides or a code-only walkthrough. Use a dedicated test workspace/mailbox and redact personal addresses and ids if needed.

## Before recording (not part of the timer)

1. Connect `https://console.mermail.app/mcp` with OAuth in the chosen client.
2. Install/load this `SKILL.md` as `mermail-freelance-ops`.
3. Prepare four harmless test emails using the subjects in [`../references/demo-fixtures.md`](../references/demo-fixtures.md).
4. Ensure the inbox has no real secrets, payment credentials, or private client information.
5. If the client shows a wallet connector, leave it untouched; the demo proves the safety boundary with a note, not a transaction.

## Timeline and narration

### 0:00–0:25 — The problem and trigger

Show the skill name and say:

> “Freelance inboxes mix paid work, scope creep, scheduling, and noise. Mermail Freelance Ops turns that into an explainable action queue. I’ll ask it to triage, flag money-sensitive messages, draft replies, and never send or touch the wallet.”

Enter this prompt:

> Review the last 14 days of my Mermail freelance inbox. Put paid or deadline-sensitive threads first, flag money-sensitive anchors by starring the exact messages, draft replies for the top three, and do not send anything. Include a wallet note for paid work, but do not touch the wallet.

### 0:25–1:05 — Mermail connection and bounded read

Show the agent calling `list_mailboxes`, choosing one mailbox, then `list_emails` or `search_emails` with a bounded date/folder query. Narrate:

> “It resolves one mailbox in the authenticated workspace and reads metadata first. The query is bounded and the skill freezes exact Mermail ids before writing.”

If the client shows safe-content fields, point out `metadata_only`, `agent_safe_content`, and `require_scan_status: clean`.

### 1:05–1:55 — Classification and differentiation

Show `get_email` or `get_email_context` for selected messages and the resulting cards. Say:

> “A deposit is payment action. Extra deliverables are scope change, not an ordinary reply, because they can change price and timeline. Scheduling is next, and the newsletter is watch. The score is explainable—not a mysterious financial prediction.”

Ensure the UI visibly shows `PAYMENT_ACTION`, `SCOPE_CHANGE`, and the two money signals.

### 1:55–2:35 — Exact reversible flags

Show the frozen target preview, then the `update_email` calls with only `starred: true`. Say:

> “The skill stars the exact anchor messages as a reversible money flag. It does not claim to attach a custom label, because Mermail custom labels define classifiers rather than manually labeling an existing message.”

Show the returned starred state.

### 2:35–3:10 — Drafts, not sends

Show two `save_draft` results and open one draft. Say:

> “Drafts are reviewable and grounded in the message. No `reply_to_email` or `send_email` call happens. Delivery would require a separate exact preview and fresh approval.”

Point out that missing budget or acceptance criteria becomes a question, not an invented commitment.

### 3:10–3:35 — Wallet boundary and final result

Show the final summary with `WALLET NOTE (not executed)`:

> “The email mentions a deposit, so the skill records a payment note. It does not inspect or move funds. A wallet action would require an explicit user request, full-profile OAuth, the PayBox connection check, and its own approval.”

End on the Now / Next / Watch queue, starred anchors, two draft ids/statuses, and “0 sent”.

## Recording checklist

- [ ] Prompt that triggers the skill is visible.
- [ ] Mermail connection and real tool calls are visible.
- [ ] Agent completes the workflow in the live client.
- [ ] Final queue, starred messages, drafts, and `0 sent` are visible.
- [ ] Video is in English and 2–5 minutes.
- [ ] No secrets, API keys, private client data, or wallet credentials appear.
- [ ] Post the video on X and tag `@Mermailapp` only after human review; this package does not post it.
