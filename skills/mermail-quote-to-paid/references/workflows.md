# Quote-to-paid workflows

## Resolve mailbox and rate card

1. Call `list_mailboxes`. Prefer a ready receiving inbox; reject verification-isolated or non-receiving ones.
2. Create only when none fits and the user authorizes provisioning.
3. Load the user's rate card (see [scripts/rate-card.example.json](../scripts/rate-card.example.json) for the shape). Ask once if none was supplied; keep using the same file for the session rather than re-asking per enquiry.

## Price and draft a quote

1. Read the enquiry with `list_emails` / `search_emails` / `get_email`, `scan_status: clean` only.
2. Call `get_email_context` on the thread. If a quote already went out on this thread, report its status instead of drafting a duplicate.
3. Extract requested service, quantity, and deadline as plain facts — not as a price.
4. Match against `line_items` by service name. Apply `rules.minimum_engagement` as a floor and `rules.rush_fee_multiplier` when the deadline is inside `rules.rush_fee_trigger_days`.
5. If nothing matches cleanly, `save_draft` a clarifying question instead of a price, and tell the user which rate-card item didn't fit.
6. `save_draft` the quote: matched line item(s), total, currency, validity window (`validity_days_default` unless the user overrides it).
7. Preview mailbox/from, exact recipient, subject, and body. Send only with `reply_to_email` after the user approves that exact payload.

## Watch for acceptance

1. On request, re-read the thread with `search_emails` / `get_email`.
2. Classify the latest reply as acceptance, negotiation, decline, or unrelated. Report it plainly.
3. A reply read as acceptance never triggers step 4 below on its own — the user must ask for the payment step.

## Request and confirm payment (only when the user explicitly asks)

1. `get_paybox_connection` first, every time — do not assume unavailability from a missing `tools/list` entry.
2. Generate exactly one payment path for the exact quoted amount and currency: `paybox_get_buy_link` for a hosted link, or `paybox_pay_x402` only when the user names the specific resource.
3. Preview the link and the email it will go in. Send only after approval, via `reply_to_email`.
4. To check status later: `paybox_get_request` / `get_agent_wallet_request` for that specific request, or `get_agent_wallet_portfolio` / `paybox_get_portfolio` for a general balance read. Match amount + currency (+ reference, if present) before reporting `paid`.
5. Report `not yet received` rather than polling in a loop. Offer to check again on the user's next request.

## Draft-only enquiry triager

1. `list_task_triagers` first; inspect recent runs before changing a failing one.
2. Propose classification-against-rate-card + quote-draft-only. Keep `reply_to_email`, `send_email`, and every `paybox_*` tool out of the triager's allowlist.
3. Create or update only after the user approves the exact configuration. Do not set a mailbox default.
