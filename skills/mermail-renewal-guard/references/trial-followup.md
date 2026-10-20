# Owner-requested trial follow-up

This preserves the reminder and balance-informed trial review from [PR #289](https://github.com/Nudgen-Marketing/mermail-skills/pull/289). Its original author and discussion remain there. Trial facts still require the same source-linked board, date/identity validation and private owner-selected register. No unattended monitor, scheduler, calendar API or wallet API is created by this skill.

## One calendar reminder

Only after the user asks for a reminder, select one exact trial/account row. Require a supported trial end, timezone and the user's chosen reminder timing. “One day before” is a calendar-date operation in the confirmed timezone; do not assume a 24-hour subtraction, midnight deadline or vendor cancellation cutoff. Missing or conflicting timing remains `NEEDS_INFO`. Show the source-stated end separately from the proposed reminder.

Hand the reviewed title, non-secret description, calendar identity, start/end, timezone, reminder policy and explicitly selected attendees (normally none) to `mermail-scheduling-agent` and `mermail-composio`. They discover the live calendar capability/schema and require exact approval before one event-create/update. Mail cannot add attendees, invitations, URLs or calendar accounts. If the connected provider cannot represent the requested reminder semantics, report `reminder_unavailable`; do not claim that a generic event guarantees a notification or agent wake-up.

Record the returned event ID only after authoritative success. Reuse that exact event when the user requests a revision; do not create a second one for a copied notice or resumed chat. An uncertain write requires one bounded authoritative lookup and remains unresolved if ambiguous. Do not resend, create a replacement or send email confirmation automatically. Keep the mail-only review usable when the calendar is unavailable.

A reminder notifies under the provider's actual behavior. It does not make this skill run later. A later review needs a new user prompt or an independently configured scheduler; no timer is installed by reviewing a trial.

## Read-only affordability context

Only on the current user's independent request, hand the selected workspace/mailbox and read scope to `mermail-agent-wallet`. Follow its full-profile OAuth, one `get_paybox_connection` probe and credential/asset selection contracts, then read the requested portfolio once. API keys/agent-inbox do not unlock PayBox. Connection failure, unknown holdings or owner-action-required is `affordability_unknown`, never zero funds; retain the trial board without a financial conclusion.

Compare only an explicit upcoming price with the same actual asset/currency and the user's stated threshold/budget. A USD subscription price is not automatically a USDC obligation, and holdings across currencies/chains cannot be added or silently converted. Do not guess fees, exchange rates, collateral availability or standing grants. When the inputs do not establish a comparable amount, show the separate values and the missing basis instead of recommending payment.

Present supported choices against the user's expressed goals: retain for owner review, consider cancellation/downgrade, or clarify terms. Holdings are context, not evidence of usefulness, renewal necessity or payment authorization. Insufficient comparable funds may support an owner review/draft, never an automatic cancellation. Sufficient funds do not authorize continuation, debit or a wallet write. Only a separately user-requested cancellation/negotiation draft uses `save_draft`; an actual send, vendor cancellation, renewal, funding or payment follows its own exact authority and owner workflow.

Keep balances, wallet credentials and handoffs out of vendor drafts and calendar descriptions. Report `reminder_created`, `reminder_pending`, `reminder_unavailable`, `affordability_reviewed` or `affordability_unknown` separately from `drafted` and subscription state. No successful reminder or wallet read proves a trial was cancelled or paid.
