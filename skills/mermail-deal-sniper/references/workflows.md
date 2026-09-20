# Deal sniper workflows

## Mailbox resolution

1. Call `list_mailboxes` to identify active receiving mailboxes.
2. Select the designated opportunity mailbox by email address or `public_id`.

## Opportunity discovery and triage

1. Call `search_emails` with bounded queries for freelance platforms (e.g., Useme, Upwork, Freelancehunt, Superteam) or client RFQ keywords.
2. Verify `scan_status: clean` before retrieving details with `get_email`.
3. Extract core deal parameters: scope, budget, tech stack requirements, and deadline.
4. Filter opportunities matching user technical skills (e.g., Python, data extraction, automation, AI).

## Proposal drafting and qualification

1. Compose a tailored, high-converting proposal addressing the specific client requirements.
2. Call `save_draft` with the proposal draft payload. Never call `send_email` during the ingestion phase.
3. Organize the thread using `create_custom_label` (e.g., `deals/qualified`) or `move_email`.
4. Present an executive summary and full draft preview to the user.

## Approved submission

1. When the user reviews and explicitly approves the draft, call `send_email` or `reply_to_email` with an idempotency key.
2. Verify delivery status from the authoritative Mermail response.
