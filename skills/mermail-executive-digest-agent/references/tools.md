# Executive digest agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

There are no financial execution, transfer, or fund disbursement tools in this workflow. Map all user intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`get_email` or `Mermail:get_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover treasury mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Search transaction alerts | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read notification detail | `get_email`, `get_thread` | `mermail-manage-inbox` |
| Draft executive digest | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Categorize or archive | `create_custom_label`, `move_email` | `mermail-manage-inbox` |

## Forbidden operations

Do not call or invent payment tools (`transfer_funds`, `pay_invoice`, `sign_transaction`). There are no execution tools for financial transfers in this agent.
