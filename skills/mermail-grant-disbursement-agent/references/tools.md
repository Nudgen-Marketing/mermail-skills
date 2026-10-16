# Grant disbursement agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`paybox_request_transfer` or `Mermail:paybox_request_transfer`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and inbox tools

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover grant administration mailboxes |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded read of milestone submissions |
| `get_email_context` | `mermail-manage-inbox` | Inspect full milestone thread context |
| `save_draft` | `mermail-compose-email` | Draft payout confirmation receipt |
| `reply_to_email` / `send_email` | `mermail-compose-email` | Send approved payout confirmation |

## PayBox and treasury tools

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Verify PayBox treasury connection |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Inspect treasury token holdings and balances |
| `paybox_request_transfer` | `mermail-agent-wallet` | Stage milestone disbursement transfer proposal |
| `paybox_get_request` | `mermail-agent-wallet` | Check status of pending signing and settlement |
| `show_paybox_signing` | `mermail-agent-wallet` | Present signing handoff URL to authorized signer |

Never call `prepare_destructive_action` for PayBox wallet actions. PayBox uses native user signing handoffs.
