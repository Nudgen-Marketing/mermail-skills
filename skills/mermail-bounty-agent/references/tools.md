# Bounty agent tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill as duplicate owners in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or a host-qualified form such as `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and bounded reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover one ready bounty inbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits and the user authorizes the 10-credit create |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | Find opportunity or sponsor messages with bounded queries |
| `get_email` / `get_thread` | `mermail-manage-inbox` | Read one clean message or bounded relevant thread |

## Drafts, approved email, and tracking

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Save clarification or submission copy without delivery |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Send only after exact preview and fresh approval |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | Track qualification and result state without deletion |

Send and reply nest Sold fields under `body`. MCP does not infer Reply All recipients. Include explicit To/Cc/Bcc and `body.from`.

## Optional draft-only triage

| Tool | Owner | Role |
| --- | --- | --- |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect before create/update |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Classify, flag risk, and draft only |

Do not call `set_default_task_triager`. Do not include sends, third-party submissions, social posts, account creation, Composio execution, wallet, payment, trading, or destructive tools in a bounty triager.

## Draft example

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "sponsor@example.com",
    "from": "bounty-desk@mermail.app",
    "subject": "Clarification: regional eligibility and payout network",
    "body": "Could you confirm whether the bounty is open globally and which network will be used for the USDC payout?"
  }
}
```
