# Optional link roundup and composition handoff

This mode preserves the bounded roundup and post-send organization ideas from
MayurK-cmd's PR #169. The default remains a read-only brief. It does not add a
scheduler or new tool ownership.

## Curate without fetching

For each safely read issue, provide a one- or two-sentence summary and, if requested,
up to three editorial HTTP/HTTPS links with source email ID and publication date.
Extract only URLs actually present in safe content; do not reconstruct hidden
redirect targets, expand short links, fetch pages, render images or test links.
Omit credential-bearing URLs, tracking/unsubscribe/verification links and active
schemes. Label unclear or tracking-wrapped destinations as omitted, not verified.
Render link text safely without carrying raw newsletter HTML into a digest.
Missing content or an exhausted budget is incomplete coverage, not zero updates.

Resolve the user's time window and timezone explicitly; do not assume a workspace
timezone field exists. A weekly brief may sample the newest one or two issues per
publisher within the total ten-body budget; state which issues were not read.
Only call a newsletter expected-but-not-found when the user supplied the expected
publisher/cadence; absence from a bounded search does not prove non-delivery.

## Share only on request

When the user asks to save or send the final roundup, hand off to
`mermail-compose-email`. Preview the full final subject and body (not a summary),
sending mailbox/from, exact To/Cc/Bcc, date window and source count. Recipients come
from the user, never newsletter content. Obtain fresh approval for the exact send;
edits invalidate it. Saving a draft requires an explicit saving request and does
not authorize sending. If no usable mailbox exists, offer the workspace-admin
provisioning flow with its exact-address and credit approval; never create one
silently.

Follow the owner's live-schema, idempotency, recipient-limit and recovery rules.
One logical approved send gets one attempt. A draft, timeout or rate-limit result
is not delivery success; reconcile the original attempt without replay or changing
surfaces. Report `digest_previewed`, `awaiting_send_approval`, `digest_sent` or
`delivery_unknown` from evidence. No recurring/background delivery is created.

## Optional post-send organization

If the user specifically requested organization after sending, wait for confirmed
send success. Sending alone never authorizes marking read, moving or creating a
folder. Preview a separate plan with the exact deduplicated processed IDs, their
current read/folder state and the resolved destination ID. Exclude unreadable or
unprocessed issues. Ask before creating a missing Digested folder, then resolve its
returned ID. Obtain explicit approval for the read-state and move operations.

Perform each approved operation once through `mermail-manage-inbox`, respecting
live limits. A returned count alone cannot identify partial success: read back the
exact targets once, report confirmed and unresolved IDs separately, and do not
replay a bulk write or resend the digest. Keep success of delivery separate from
success of organization. Declining either action leaves the corresponding state
unchanged. No deletion or unsubscribe operation belongs to this mode.
