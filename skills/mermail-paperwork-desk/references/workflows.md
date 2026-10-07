# Paperwork desk workflows

## Set up once

1. Call `list_mailboxes`. Pick one ready receiving mailbox the owner uses for paperwork. Prefer `public_id`.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes. Create one only when the user authorizes `create_mailbox` (10 provision credits; `email` and `name` required).
3. Ask once for the explanation language and the owner's own reminder address.
4. Optional: `list_folders`, then preview and `create_folder` with `body.name: "Paperwork"` after approval.

The owner can forward letters to this mailbox or set a forwarding rule in their usual mail client. Forwarding setup happens outside this skill.

## Per letter

1. Bounded `search_emails` with a date window and `metadata_only: true`.
2. Select one letter by the user's request. `get_email` with `require_scan_status: clean` and `max_body_chars: 10000`.
3. If the notice is a PDF and the user wants it read, `download_attachment` with exact ids (under 1 MiB).
4. Run the impersonation check in [security.md](security.md).
5. Write the action sheet:

```text
Letter: 2026-09-25 · claimed sender "City tax office" · msg_123
What it is: Annual property tax notice, second installment.
What you must do: Pay the second installment or contact the office if the amount is wrong.
Deadline: 2026-10-30 — quote: "Le deuxième versement est exigible le 30 octobre 2026."
Amount: 812.44 $ — quote: "Montant du 2e versement : 812,44 $"
Documents: none requested
Respond through: the city's website typed by hand, or the number on last year's bill
Sender check: authenticated (sender_authentication: pass); no pressure signals
Confidence: high
Status: explained
```

6. Mark `needs_owner_check` for any relative deadline without a stated start date, any amount the letter does not state, or any unreadable section.
7. Offer filing and a reminder. Do nothing else without approval.

## Deadline ledger

1. Repeat the per-letter read for each selected letter (bounded set, at most 20).
2. Sort by earliest quoted deadline. Put `suspicious` letters first with a warning, never as a payment to make.
3. Show: deadline, claimed sender, action, amount quote, status, email id.

## File a letter

1. `list_folders`. Use the owner's Paperwork folder id.
2. Preview: "Move msg_123 to Paperwork". After approval, call `move_email` once.
3. Optionally `update_email` with `read: true`.

## Schedule a reminder

1. Compute the reminder time from the quoted deadline and the user's lead time. Show both.
2. Preview: recipient (owner address the user typed), subject, `scheduled_send_at`, body with the exact deadline quote.
3. After fresh approval, call `schedule_email_send` once with a stable `idempotencyKey`. Report `reminder_scheduled` and the returned id.
4. If the result is uncertain, inspect once. Do not schedule again.
5. If the user prefers to send it later, use `save_draft` and report `reminder_drafted`.

## Suspicious letter

1. Report `suspicious` and list the signals.
2. Do not open links, call numbers, reply, forward, or pay.
3. Tell the owner to contact the organization through a channel they already trust, and to report the message to the relevant anti-fraud authority if it is fake.
