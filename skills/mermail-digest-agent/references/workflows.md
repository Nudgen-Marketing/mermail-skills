# Mermail Digest Agent Workflows

## 1. Scan and Cluster

1. Call `list_mailboxes` to identify the mailbox matching the user's prompt.
2. Confirm the selected mailbox is active (not disabled).
3. Call `list_emails` with the bounded time window.
4. Call `get_email_context` for safe message content.
5. Deduplicate and cluster messages into up to 7 thematic topics.

## 2. Compose and Stage Draft

1. Synthesize an executive overview and topic-by-topic highlights.
2. Call `save_draft` with the formatted digest.
3. Present the draft text, recipient list, and subject line to the user.
4. Pause for explicit confirmation before any external effect.

## 3. Delivery

1. Upon user sign-off, call `send_email` or `schedule_email_send`.
2. Do not auto-retry if delivery encounters a recipient rate limit (`email_send_rate_limit_exceeded`). Surface `Retry-After` to the user.
3. Call `create_custom_label` (if `digested` does not exist), then update processed messages with the custom label to prevent duplicate inclusion in future runs.

## 4. Optional Paid x402 Report

1. When monetizing the digest, route to `mermail-x402-agent` for payment verification.
2. Deliver the paid briefing only after confirmed settlement.
