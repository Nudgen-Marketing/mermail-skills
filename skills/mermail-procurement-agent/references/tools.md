# Tools used by `mermail-procurement-agent`

This skill owns no tools. Every tool below is owned by another official skill; this file records
which owner to follow for arguments, error handling, and approval contracts.

Risk classes come from `tool-coverage.json`:
`read` = no side effect, `internal-write` = reversible inside the workspace,
`external-effect` = leaves the workspace, `destructive` = needs `prepare_destructive_action`,
`wallet-write` = uses the live PayBox approval/signing flow instead of `prepare_destructive_action`.

## Workspace and mailbox discovery — owner `mermail-administer-workspace`

| Tool | Use here | Class |
| --- | --- | --- |
| `list_workspaces`, `get_workspace` | Resolve the workspace once and reuse the id | read |
| `list_mailboxes`, `list_workspace_mailboxes`, `get_mailbox` | Choose the invoice intake mailbox; prefer `public_id` as `mailboxId` | read |
| `create_mailbox` | Only when no mailbox fits and the owner authorizes it | internal-write |
| `get_api_credit_usage`, `get_email_usage` | Report capacity before a bulk intake pass | read |

## Invoice reading — owner `mermail-manage-inbox`

| Tool | Use here | Class |
| --- | --- | --- |
| `search_emails`, `list_emails` | Find candidate invoices; metadata first | read |
| `get_email`, `get_email_context`, `get_thread` | Read one invoice and its thread context | read |
| `download_attachment` | Fetch a PDF invoice for local extraction | read |
| `move_email`, `bulk_move_emails` | File an invoice after its state is recorded | internal-write |
| `update_email` | Record read/star state while working the queue | internal-write |
| `list_folders`, `create_folder` | Create the Invoices folder when missing | read / internal-write |
| `list_custom_labels`, `create_custom_label` | Label payment state (for example `Invoice/Proposed`, `Invoice/Paid`, `Invoice/Blocked`) | read / internal-write |
| `delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`, `delete_custom_label` | Destructive: only on explicit owner approval, with `prepare_destructive_action` | destructive |

## Confirmation mail — owner `mermail-compose-email`

| Tool | Use here | Class |
| --- | --- | --- |
| `save_draft` | Draft an internal note or a vendor confirmation for review | internal-write |
| `reply_to_email`, `send_email`, `forward_email`, `schedule_email_send` | Send the confirmation or escalate to the owner; exact preview and approval required | external-effect |
| `regenerate_draft` | Rewrite a draft that the owner rejected | internal-write |

Sending a confirmation is a separate authorization from approving a payment. Neither implies the other.

## Wallet readiness and payment — owner `mermail-agent-wallet`

| Tool | Use here | Class |
| --- | --- | --- |
| `get_paybox_connection` | Confirm the wallet connection is live before proposing a payment | read |
| `get_agent_wallet`, `get_agent_wallet_portfolio`, `paybox_get_portfolio` | Check balance/portfolio so a payment is not proposed from an unfunded wallet | read |
| `list_agent_wallet_credentials` | Inspect available credentials (never chat input) | read |
| `paybox_request_transfer` | Prepare the transfer for the owner to approve and sign | wallet-write |
| `create_agent_wallet_transfer_proposal`, `submit_agent_wallet_transfer`, `reject_agent_wallet_transfer_proposal` | Older proposal path; only if the connected profile exposes it | wallet-write |
| `get_agent_wallet_request`, `paybox_get_request`, `get_paybox_invocation` | Re-read authoritative request state after owner action | read |
| `paybox_request_swap`, `paybox_pay_x402` | Not used by this skill — route swapping and x402 pay-per-request to `mermail-x402-agent` | wallet-write |

Wallet writes never use `prepare_destructive_action`. Their authorization is the PayBox approval and
signing flow itself, so this skill prepares one exact request per authorized invoice and then stops.

## Not used here

`list_agent_conversations`, `chat_with_mailbox_agent`, `list_task_triagers`, `create_task_triager`,
`list_composio_toolkits`, `execute_composio_tool`: mailbox-agent delegation, triage automation, and
third-party toolkit execution belong to their own skills and are not part of invoice intake.
