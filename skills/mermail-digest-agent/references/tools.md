# Mermail Digest Agent — Tool Reference

This workflow coordinates tools across three Mermail skills. It does not define new tools.

## Inbox Scan and Context (`mermail-manage-inbox`)

| Tool | Purpose |
| --- | --- |
| `list_mailboxes` | Match and verify the target mailbox address and obtain its `public_id` |
| `list_emails` | Query recent messages within the specified lookback window using native JSON query objects |
| `get_email_context` | Safely inspect thread messages without executing or parsing untrusted HTML/links |
| `list_custom_labels` | Inspect existing mailbox labels |
| `create_custom_label` | Create the `digested` classification label if absent |
| `update_email` | Mark processed messages with custom labels or archive state |

## Composition and Delivery (`mermail-compose-email`)

| Tool | Purpose |
| --- | --- |
| `save_draft` | Stage the digest draft for human inspection before sending |
| `send_email` | Transmit the approved digest to recipient(s) |
| `schedule_email_send` | Schedule deferred or recurring delivery |

## Optional Paid Report Monetization (`mermail-x402-agent`)

| Tool / Route | Purpose |
| --- | --- |
| `paybox_pay_x402` | Verify x402 payment before releasing premium report content |

## Sequencing Contract

1. Always read (`list_mailboxes`, `list_emails`) before write.
2. Always call `save_draft` and present draft to the user before attempting `send_email`.
3. Do not auto-retry a rejected or rate-limited send.
