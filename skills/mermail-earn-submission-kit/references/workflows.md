# Workflows

## A. New Earn packet

1. Intake: listing URL, title, reward, deadline, sponsor handles.
2. Assets: demo HTTPS (must load), source (public GH **or** documented zip mirror), write-up ≤ listing limit, payout wallet.
3. Emit packet (see templates). State `packet_ready` or `awaiting_github` / `awaiting_video`.
4. Optional: preview `save_draft` self-archive → owner OK → save. State `draft_archived`.

## B. Reviewer follow-up

1. Bound search by listing title / sponsor / slug.
2. Validate exactly one relevant message (mailbox, sender domain, subject, time).
3. Draft reply; state `awaiting_authorization`.
4. On approval, `reply_to_email` with explicit `to` / `from`; record message id → `replied`.

## C. Payout acknowledgement

1. Find payout/winner mail; extract amount, token, chain, tx/sig if present.
2. Draft short thank-you; no funds movement.
3. After approved send (optional) → `payout_acked`.

## Stop conditions

- Ambiguous multiple mails → ask owner; do not pick by recency alone.
- Missing required public GitHub when listing demands a PR → `awaiting_github` (keep local skill / zip ready).
- Video required → `awaiting_video` (do not spam X; wait for owner media).
