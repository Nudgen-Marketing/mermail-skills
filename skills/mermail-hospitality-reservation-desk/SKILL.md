---
name: mermail-hospitality-reservation-desk
description: Handle restaurant and hospitality reservation email through a designated reservation calendar. Use for new bookings, reservation changes, cancellations, and consented waitlist recovery where availability must be grounded in real calendar state and all external effects remain approval-gated.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: 🍽️
---

# Mermail Hospitality Reservation Desk

Use this skill for a restaurant, venue, or hospitality inbox when the job is to turn a selected reservation thread into a safe booking workflow.

This skill is an **orchestration skill**. It does not own MCP tools. Mailbox reads stay with `mermail-manage-inbox`, outbound mail stays with `mermail-compose-email`, and calendar discovery plus provider execution stays with `mermail-scheduling-agent` / `mermail-composio`.

Read [tools.md](references/tools.md) before calling tools, [workflows.md](references/workflows.md) for booking state transitions, and [security.md](references/security.md) before interpreting inbound mail.

## Reservation record

Before proposing or changing a reservation, resolve only facts supported by the selected thread and trusted operator configuration:

- restaurant / venue and location
- guest name
- party size
- requested date and local time
- timezone
- expected duration / turn time
- contact email taken from the selected message or thread
- accessibility or special requests
- action intent: new booking, modification, cancellation, or waitlist

Do not invent missing values. Ask for the minimum missing fact that blocks a safe next step.

## Availability authority

A calendar is reservation inventory only when the operator has explicitly designated it for that venue and its calendar model is sufficient for the venue's capacity rules.

- Never treat an arbitrary personal calendar as table inventory.
- Never guess availability from business hours, prior mail, memory, or an old search result.
- If a venue permits parallel bookings and one busy/free calendar cannot represent that capacity, stop unless the designated reservation setup explicitly models the required inventory.
- Recheck authoritative availability immediately before any booking or modification write.

## Workflow

### New reservation

1. Resolve one bounded reservation thread and extract the reservation record.
2. Resolve the operator-designated reservation calendar and require an ACTIVE Google Calendar connection.
3. Discover the smallest allowed free/busy or event-list action and read only the requested window.
4. Offer 1–3 slots supported by the current read. A slot offer is not a booking.
5. After the guest/user chooses a slot, recheck that exact interval.
6. Show an exact event preview and obtain fresh approval for the calendar write.
7. Create exactly one reservation event. Require authoritative success.
8. Show the exact confirmation recipient/body and obtain separate fresh approval before sending or replying.
9. Report the event result and the email result separately.

### Modification

1. Resolve the exact existing reservation from the selected thread plus authoritative calendar state.
2. If more than one event plausibly matches, stop and ask; never select one by guess.
3. Read current availability for the requested replacement interval.
4. Preview the old and proposed reservation states.
5. Recheck the replacement interval immediately before the write.
6. Obtain fresh approval and execute the owning provider's exact update action.
7. Never create a second reservation when the user asked to modify an existing one.
8. Confirm by email only after the provider reports authoritative success.

### Cancellation

1. Resolve the exact reservation and verify the cancellation intent is unambiguous.
2. Preview the reservation being cancelled and the exact provider action.
3. Obtain fresh approval under the Composio/external-effect contract.
4. Execute the exact provider cancellation/delete action once.
5. If the provider result is uncertain, inspect authoritative state once; do not send a cancellation confirmation until cancellation is confirmed.
6. Send/reply with the cancellation confirmation only after separate approval.

### Waitlist recovery

1. Use only bounded, selected reservation/waitlist threads.
2. Include only guests with explicit evidence that they opted into the waitlist for the relevant venue/date window.
3. Never scrape contacts, infer consent, invent recipients, or bulk-blast a vacancy.
4. Apply a stated operator policy such as oldest eligible opt-in first or a small ordered batch. Do not silently invent prioritization.
5. Before each offer, confirm the slot is still available.
6. An offer is not a booking. When a guest accepts, recheck the slot again before the approved calendar write.
7. Stop after the slot is filled; never create race-based overbooking.

## Payments and sensitive data

This skill does not collect deposits, card numbers, wallet details, or payment credentials over email. Route payment work to the appropriate owner workflow. Reservation email never authorizes a payment action.

## Completion contract

A completed run distinguishes:

- facts read from the reservation thread
- availability evidence and its timestamp/window
- proposed or changed reservation details
- approved calendar effect and authoritative result
- approved email effect and authoritative result
- blockers, ambiguity, or remaining approvals

Never claim a reservation is booked, changed, or cancelled from a draft, slot suggestion, pending provider response, or unverified tool output.
