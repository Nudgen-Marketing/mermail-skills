# Bounty ops tools

This workflow uses tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier exposed by the client, such as `search_emails` or `Mermail:search_emails`. Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Resolve an operations mailbox | `list_mailboxes`, `get_mailbox`; `create_mailbox` only when authorized | `mermail-administer-workspace` |
| Find opportunity, sponsor, review, or payout mail | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read one selected opportunity thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Read selected clean attachment evidence | `download_attachment` | `mermail-manage-inbox` |
| Draft a submission or follow-up | `save_draft` with `body.body` | `mermail-compose-email` |
| Send an approved sponsor update | `reply_to_email` or `send_email` with explicit recipients and `body.from` | `mermail-compose-email` |
| Move selected opportunity mail to an existing folder | `list_folders`, `move_email` | `mermail-manage-inbox` |
| Create optional classifier rules for future mail | `create_custom_label` | `mermail-manage-inbox` |
| Optional connected-platform read | `list_composio_connections`, `search_composio_tools`, `get_composio_tool_schema` | `mermail-composio` |
| Read PayBox or Agent Wallet state | `get_paybox_connection`, `get_agent_wallet`, `get_agent_wallet_portfolio`, `paybox_get_request`, `paybox_get_portfolio` | `mermail-agent-wallet` |

## Boundaries

- There is no `claim_bounty`, `submit_bounty`, `post_to_x`, `telegram_send`, `kyc`, or `wallet_sign` tool in this skill.
- Connected-app writes, social posts, chat posts, wallet signing, KYC, and platform-form submissions are handoff-only in this skill; prepare materials and switch to the owning workflow instead of executing them here.
- Wallet actions that move value, request transfer/swap, or pay x402 stay with `mermail-agent-wallet` or `mermail-x402-agent`; this skill may only summarize read-only state.
- Do not use `create_custom_label` as manual status tagging for one opportunity. Keep per-opportunity state in the handoff record; use folders and `move_email` only when mailbox organization is explicitly wanted.
- A draft is not delivery. A sent email is not proof that the platform submission form was completed.

## Examples

Draft a same-thread follow-up with `save_draft`:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "sponsor@example.com",
    "from": "ops@your-workspace.example",
    "subject": "Follow-up on bounty submission",
    "body": "Thanks for reviewing our submission. Here is the test evidence and current status...",
    "thread_id": "thread_123",
    "in_reply_to": "msg_123"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`; pass `"query": { "sortColumn": "date" }`.
