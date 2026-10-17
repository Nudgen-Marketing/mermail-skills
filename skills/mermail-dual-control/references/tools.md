# Dual-control tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no `verify_payment`, `approve_order`, `check_terms`, or `release_funds` tools. The maker/checker derivation and comparison happen in the agent, not in MCP. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Find the payment request | `list_emails`, `search_emails` (native JSON `query`) | `mermail-manage-inbox` |
| Read the primary document (maker) | `get_email` | `mermail-manage-inbox` |
| Re-derive from thread context (checker) | `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Check envelope details (Reply-To, CC, From) | `get_email`, `get_email_context` | `mermail-manage-inbox` |
| Save the agreement record / escalation draft | `save_draft` (`body.body` string, or `body.html`/`body.text` where supported) | `mermail-compose-email` |
| Send an approved record | `reply_to_email` / `send_email` (explicit `to`/`cc`/`bcc`), only after fresh approval | `mermail-compose-email` |
| Execute the approved payment | not here - hand the Payment Order to `mermail-agent-wallet` | `mermail-agent-wallet` |

## Mailbox discovery

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready mailbox for the review target |
| `get_email_usage` / `get_api_credit_usage` | `mermail-administer-workspace` | Check budget before wide scans |

There is no server-side amount filter, payee directory, or OCR tool. Amounts, destinations, and payee names come from `get_email` / `get_email_context` content only. Wallet reads (`get_paybox_connection`, `paybox_get_portfolio`) and every PayBox write stay on `mermail-agent-wallet`.
