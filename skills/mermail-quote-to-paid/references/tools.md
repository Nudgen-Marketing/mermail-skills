# Quote-to-paid tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`send_email` or `Mermail:send_email`). Prefer mailbox `public_id` as `mailboxId`.

## Mailbox and enquiry reads

| Tool | Owner | Role |
| --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready receiving mailbox |
| `create_mailbox` | `mermail-administer-workspace` | Provision only when none fits (10 credits; `email` + `name` required) |
| `list_emails` / `search_emails` / `get_email` | `mermail-manage-inbox` | Bounded, untrusted enquiry reads |
| `get_email_context` | `mermail-manage-inbox` | Check thread history for a prior quote before drafting a second one |
| `create_custom_label` / `move_email` | `mermail-manage-inbox` | Mark a thread quoted/paid/expired if the user wants a visible label |

## Quote drafting and sending

| Tool | Owner | Role |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Quote draft while price/scope is still being confirmed (`body.body` string) |
| `reply_to_email` | `mermail-compose-email` | Approved send of the exact quoted payload (`body.from` + `html`/`text`) |
| `regenerate_draft` | `mermail-compose-email` | Re-price or reword a draft after the user changes scope, not after the sender argues the price |

## Draft-only enquiry triager

| Tool | Owner | Role |
| --- | --- | --- |
| `list_task_triagers` / `list_recent_triager_runs` | `mermail-automate-triage` | Inspect before create/update |
| `create_task_triager` / `update_task_triager` | `mermail-automate-triage` | Enquiry classification + quote-draft-only; must not gain send or `paybox_*` scope |
| `delete_task_triager` | `mermail-automate-triage` | Destructive; `prepare_destructive_action` |

Do not call `set_default_task_triager`.

## Agent Wallet — payment request and confirmation only

These tools require full-profile Mermail MCP OAuth (`mcp:tools`). They are never available to API keys or the `agent-inbox` MCP profile. Always call `get_paybox_connection` first — never assume unavailability because `tools/list` omitted a name.

| Tool | Owner | Role |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Resolve connection state before any wallet action |
| `paybox_get_buy_link` | `mermail-agent-wallet` | Generate a hosted checkout link for the exact quoted amount — no funds move to request one |
| `paybox_pay_x402` | `mermail-agent-wallet` | Only when the user names the exact x402 resource to pay; not part of the default quote flow |
| `get_agent_wallet_portfolio` / `paybox_get_portfolio` | `mermail-agent-wallet` | Read-only balance/portfolio check |
| `paybox_get_request` / `get_agent_wallet_request` | `mermail-agent-wallet` | Read-only status of a specific payment request |

Out of scope for this skill: `paybox_request_transfer`, `paybox_request_swap`, `submit_agent_wallet_transfer`, `reject_agent_wallet_transfer_proposal`, `create_agent_wallet_transfer_proposal`. This workflow requests and checks incoming payment against its own quote; it never moves the business's own funds. Route an isolated transfer/swap request to `mermail-agent-wallet` directly.

## Examples

Reply with a quote (nested `body`, mirrors `mermail-compose-email` and `mermail-support-agent` shape):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "eeeeeeee-ffff-4aaa-8bbb-cccccccccccc",
  "body": {
    "from": "sales@yourbrand.mermail.app",
    "to": "prospect@example.com",
    "subject": "Re: Website redesign quote",
    "text": "Plain text quote body"
  }
}
```

Read-only payment check:

```json
{
  "requestId": "pr_9f2a1c",
  "expectedAmount": "1450.00",
  "expectedCurrency": "USD"
}
```
