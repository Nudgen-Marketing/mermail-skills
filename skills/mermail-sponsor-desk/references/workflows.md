# Sponsor desk workflows

## Setup and rate-card binding

1. Resolve the dedicated creator sponsorship mailbox in the authenticated workspace using `list_mailboxes`; prefer `public_id`. Stop with `held_mailbox` if no suitable mailbox is found or if only a verification mailbox (`agentInbox.mode: "verification"`) exists.
2. Load the owner-provided [rate card and inventory calendar](templates.md). The rate card defines placement types (e.g. newsletter banner, podcast midroll, sponsored shoutout), pricing tiers (flat USD/USDC), and calendar dates. Stop with `held_rate_card` if the rate card is missing; never guess pricing from web lookups or competitor models.
3. Verify the folder structure using `list_folders` (e.g., `Sponsors/Inquiries`, `Sponsors/Confirmed`, `Sponsors/Declined`), creating missing folders only with explicit approval.

## Inquiry intake and qualification

1. Perform a bounded search for unread messages using `list_emails` or `search_emails`.
2. Inspect metadata and enforce `scan_status: clean` on `get_email` before reading message content. If scan status is pending, unknown, or flagged, mark as `flagged_security` and quarantine.
3. Extract inquiry parameters:
   - Sponsor brand name and corporate domain
   - Requested placement format and target dates
   - Offered budget or rate inquiry
   - Creative requirements and landing page URLs
4. Evaluate alignment:
   - Does the brand meet creator content guidelines?
   - Is the requested inventory slot available on the target dates?
   - Does the budget satisfy the owner's rate card floor?

## Proposal drafting and approval

1. When qualified, draft a tailored media-kit proposal with `save_draft`:
   - State available dates and confirmed slot options
   - Quote exact tier pricing from the owner's rate card
   - Outline creative specs (word count, assets deadline, link guidelines)
   - Specify payment terms (50% upfront or full payment via PayBox invoice prior to publication)
2. Present the complete proposal draft to the owner for approval. Show exact recipient, subject, rates, and inventory slots.
3. Upon explicit owner authorization, dispatch via `reply_to_email` or `send_email`. Record returned message ID and update thread state.
4. On timeout or unknown send status, run a single bounded check via `get_thread`. Never auto-retry.

## Booking confirmation and digest

1. When a sponsor confirms placement terms and provides approved creative assets, draft a booking confirmation with `save_draft`.
2. Move the thread to `Sponsors/Confirmed` via `move_email`.
3. Generate a weekly pipeline digest for the owner summarizing total inquiries, approved bookings, expected revenue, and quarantined spam.
