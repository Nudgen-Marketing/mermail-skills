# Earn inbox triage — tool map

This workflow **uses** tools owned by other official skills. Do **not** add them under this skill in `tool-coverage.json`. Persona skills (`mermail-support-agent`, `mermail-gtm-agent`) follow the same pattern.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover mailbox | `list_mailboxes` (optional `create_mailbox` with approval) | `mermail-administer-workspace` |
| Poll / search Earn mail | `list_emails`, `search_emails` | `mermail-manage-inbox` |
| Read one message / thread | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Draft reply | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send reply (after approval) | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Escalate to human | `forward_email` or `save_draft` to owner | `mermail-compose-email` |
| Organize | `create_custom_label`, `move_email`, `bulk_mark_emails_read` | `mermail-manage-inbox` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |
| Wallet connection (optional) | `get_paybox_connection` | `mermail-agent-wallet` (wallet-scoped) |
| Wallet balances (optional, read-only) | `get_agent_wallet`, `paybox_get_portfolio`, `get_agent_wallet_portfolio` | `mermail-agent-wallet` |
| Wallet writes | **Out of scope for this skill's default path** — route to `mermail-agent-wallet` after fresh human authority | `mermail-agent-wallet` |

## Suggested search shapes

Newest-first list (metadata first):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "limit": 10,
  "sortColumn": "date",
  "sortDirection": "DESC"
}
```

Keyword search example (adjust to live schema):

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": "Earn OR bounty OR Superteam OR submission OR prize",
  "limit": 10
}
```

## Draft reply example

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "organizer@example.com",
    "from": "agent@example.mermail.app",
    "subject": "Re: Mermail skill bounty — demo + PR ready",
    "body": "Thanks — demo video and public PR links are ready for review. I will not send funds or change wallet state from this thread."
  }
}
```

## Wallet stub (read-only)

1. `tools/call` `get_paybox_connection` once (OAuth full profile).
2. If usable/`ACTIVE`, optionally read portfolio/balances.
3. Emit a **chat stub** (not a PayBox write) with fields: `proposed_amount`, `asset`, `chain`, `destination`, `memo`, `status: awaiting_human_confirm`.
4. Do **not** call `paybox_request_transfer`, `submit_agent_wallet_transfer`, `paybox_request_swap`, `paybox_pay_x402`, or proposal submit/reject tools from this skill unless the user explicitly pivots to `$mermail-agent-wallet` with exact terms in a new authority.

API-key MCP sessions never expose wallet tools — say so and continue with inbox triage only.
