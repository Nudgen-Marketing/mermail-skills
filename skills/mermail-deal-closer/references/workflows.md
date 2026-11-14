# Deal lifecycle workflow

## 1. Intake

Start only from an opportunity selected by the authenticated user. Resolve the relevant mailbox, thread, and message identifiers using bounded reads.

## 2. State reconstruction

Build the current lifecycle state from the conversation. Prefer the newest authoritative evidence. If messages conflict, surface the conflict and avoid silently resolving it.

## 3. Qualification ledger

Maintain a compact ledger:

| Dimension | Values |
| --- | --- |
| Need | confirmed / inferred / unknown |
| Authority | confirmed / inferred / unknown |
| Budget | confirmed / inferred / unknown |
| Logistics | confirmed / inferred / unknown |
| Timeline | confirmed / inferred / unknown |

A dimension becomes confirmed only when the conversation explicitly supports it or the user provides it.

## 4. Next best action

Choose one material blocker. Ask the smallest useful question. If communication is needed, draft through the owning email workflow. Do not send without the required authorization.

## 5. Re-evaluation

When a new message arrives, reload authoritative conversation evidence and update the ledger. Do not append assumptions to a stale state.

## 6. Qualification threshold

A deal can be reported as `QUALIFIED_OPPORTUNITY` when all five dimensions are sufficiently confirmed for the user's stated business context. If a dimension is not relevant, record why rather than pretending it is known.

Qualification does not mean a contract exists, payment is due, or a meeting is booked.

## 7. Handoff

Return a concise handoff containing:

- opportunity state;
- qualification ledger;
- key evidence identifiers;
- buying signals;
- unresolved risks;
- recommended next action;
- owning skill for that action;
- approval required, if any.

## Example progression

1. Prospect asks about automating customer support → Need becomes confirmed; buying signal recorded.
2. Prospect provides a $3,000 budget and 30-day target → Budget and Timeline become confirmed.
3. Agent asks who approves the project → Authority becomes confirmed after the reply.
4. Implementation constraints are clarified → Logistics becomes confirmed.
5. All dimensions meet the user's threshold → report `QUALIFIED_OPPORTUNITY` and hand off to scheduling or another explicitly requested next step.
