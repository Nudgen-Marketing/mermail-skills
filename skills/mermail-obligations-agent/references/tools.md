# Tools — Mermail Obligations Agent

This skill claims **no** tool ownership in `tool-coverage.json`. It is a cross-domain workflow that
routes to existing owners, in the manner permitted by `CONTRIBUTING_A_SKILL.md`. Every tool below
remains owned by the skill named in the right-hand column.

## Discovery and Register

| Tool | Use here | Owner |
| --- | --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace | `mermail-administer-workspace` |
| `list_mailboxes` | Resolve the target mailbox | `mermail-administer-workspace` |
| `search_emails` | Find attachment-bearing candidates; rebuild register from labels; retrieve counterparty history | `mermail-manage-inbox` |
| `list_emails` | Fallback newest-first enumeration when search is unavailable | `mermail-manage-inbox` |
| `get_email` | Read metadata and, after selection, bounded clean content | `mermail-manage-inbox` |
| `get_email_context` | Prior correspondence for payee reconciliation, after selection only | `mermail-manage-inbox` |
| `download_attachment` | Retrieve the document the deadline is extracted from | `mermail-manage-inbox` |
| `list_custom_labels` | Check taxonomy before creating | `mermail-manage-inbox` |
| `create_custom_label` | Create missing taxonomy labels, once | `mermail-manage-inbox` |
| `update_email` | Apply and change obligation labels — this is the register write | `mermail-manage-inbox` |

## Reminders

| Tool | Use here | Owner |
| --- | --- | --- |
| `save_draft` | Build the ladder-rung reminder for preview | `mermail-compose-email` |
| `send_email` | Send after explicit approval of that exact draft | `mermail-compose-email` |
| `reply_to_email` | Reply in-thread when the obligation has live correspondence | `mermail-compose-email` |
| `schedule_email_send` | Place a rung at its trigger date instead of sending now | `mermail-compose-email` |

## Settlement

Wallet-scoped. The connection is owner-only and is never established by this skill.

| Tool | Use here | Owner |
| --- | --- | --- |
| `get_paybox_connection` | Confirm a wallet is connected before offering settlement | `mermail-agent-wallet` |
| `get_agent_wallet_portfolio` | Confirm sufficient balance before proposing | `mermail-agent-wallet` |
| `create_agent_wallet_transfer_proposal` | Build the preview, only after payee reconciliation passes | `mermail-agent-wallet` |
| `reject_agent_wallet_transfer_proposal` | Cancel an open proposal when reconciliation fails | `mermail-agent-wallet` |
| `submit_agent_wallet_transfer` | Execute, only on fresh approval of the shown preview | `mermail-agent-wallet` |
| `get_agent_wallet_request` | Read back state before any retry decision | `mermail-agent-wallet` |

## Call Conventions

- `query` values are native JSON objects. Never pass a stringified JSON blob.
- Prefer metadata-only reads. Fetch content only after a candidate is selected.
- Bound every search with an explicit `date_start`. Default to 90 days when the user gives no
  range, and say so.
- Stop on `401`, `402`, `403`, and `429`. Do not loop.
- Free-plan send limits: 10 recipients per request, 10 per minute, 50 per hour, 200 per day. One
  ladder rung per obligation per run stays well inside these.

## Not Used

`create_mailbox`, `delete_email`, `bulk_delete_emails`, `empty_trash`, `paybox_request_swap`,
`paybox_pay_x402`, and the Composio catalogue are outside this workflow. If a task needs them,
hand off to the owning skill rather than reaching for them here.
