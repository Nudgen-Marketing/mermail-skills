# Invoice settle agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and invoice intake

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` / `create_mailbox` | `mermail-administer-workspace` | Discover or provision the AP mailbox |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded untrusted invoice reads |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | `invoice/pending`, `invoice/paid`, `invoice/blocked` |
| `save_draft` / `reply_to_email` / `send_email` | `mermail-compose-email` | Receipt draft and approved send |

## PayBox settlement

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | First PayBox probe; full-profile OAuth only |
| `paybox_get_portfolio` / `paybox_list_credentials` | `mermail-agent-wallet` | Read holdings and eligible credentials |
| `paybox_request_transfer` | `mermail-agent-wallet` | Default USDC/catalog transfer after approval |
| `paybox_get_request` | `mermail-agent-wallet` | One post-sign settlement read |

Do not call `prepare_destructive_action` for PayBox. Do not use Gmail/Outlook Composio. Route `paybox_pay_x402` continue-jobs to `mermail-x402-agent`.
