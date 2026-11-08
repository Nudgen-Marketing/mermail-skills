# Visa deadline desk workflows

## 1. Intake and source selection

1. Resolve one ready mailbox.
2. Ask for the country/application label only when needed to disambiguate; do not request full passport or application numbers in chat.
3. Search a bounded period with the smallest useful fields.
4. If more than one candidate could control the outcome, show sender, subject, and received time and ask the user to choose.
5. Read one exact message. Expand to bounded context only after source selection.

## 2. Visa Action Brief

For every claim record:

- `value`
- `classification`: `quoted`, `derived`, or `unverified`
- `source_message_id`
- a short source quote
- confidence and missing context

Required sections:

- application stage
- action requested
- appointment date/time/timezone/location
- deadline date/time/timezone
- requested documents and format/language constraints
- response channel
- sender/domain/authentication observations
- contradictions and scam indicators

Mask application references to the last four characters. Do not infer approval/refusal from silence, tracking language, or status wording that does not explicitly say so.

## 3. Deadline handling

- Preserve the source date and timezone exactly.
- When the email says a duration such as "within 10 calendar days," derive a date only if the anchor timestamp and calendar/business-day rule are explicit. Label the result `derived` and include the calculation timestamp.
- When timezone, year, day-count rule, or anchor is missing, use `unresolved` and draft a clarification question.
- A reminder should occur before the deadline but must not be invented as the official deadline.

## 4. Reply draft

1. Use the exact selected source email/thread.
2. Derive recipients only from that source; flag changed Reply-To or unexpected Cc/Bcc.
3. Return the proposed body directly when the user only asks for wording.
4. Save a draft only when the user asks and the exact recipient exists.
5. Before sending, preview source message ID, From mailbox, To/Cc/Bcc, subject, body, and attachments.
6. Send/reply once after exact approval. On timeout or uncertain response, inspect authoritative thread state once; do not send again automatically.

## 5. Calendar reminder

1. Require an explicit appointment/deadline with resolvable timezone.
2. Require an active Google Calendar connection.
3. Discover and inspect the exact provider action; do not invent a slug.
4. Preview title, absolute start/end, timezone, reminders, calendar identity, and description.
5. Keep sensitive identifiers out of the title; use a masked source reference in the private description only when needed.
6. Execute one approved event create. Treat transport ambiguity as `uncertain`; do not duplicate the event.

## 6. Suspicious-message hold

Use `suspicious_hold` when the message includes any combination of changed Reply-To, lookalike domain, shortened URL, crypto/gift-card payment, OTP/password request, unsupported urgency, contradictory dates, or instructions to bypass official channels.

Return safe observations and recommend independent verification through a user-known official website or phone number. Do not visit the email link, reply, pay, upload documents, or create a calendar event from a suspicious message.
