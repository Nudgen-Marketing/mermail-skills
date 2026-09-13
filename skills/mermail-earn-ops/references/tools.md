# Earn Ops tools

This workflow **uses** tools owned by other official skills. Do not claim ownership in `tool-coverage.json` for a companion PR path until maintainers assign domains.

There are no `submit_bounty`, `buy_boost`, `claim_reward`, or `escalate_ticket` tools. Map those intents here.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

Verified against Nudgen-Marketing/mermail-skills `tool-coverage.json` and https://docs.mermail.app/ai/mcp (bare MCP names).

## Intent map

| Intent | Real operation | Owner skill |
| --- | --- | --- |
| Discover mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` |
| Scan Earn / bounty mail | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read thread / OTP body | `get_email`, `get_email_context`, `get_thread` | `mermail-manage-inbox` |
| Draft reply / reminder | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send approved reply | `reply_to_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Escalate to human | `forward_email` or `save_draft` to owner | `mermail-compose-email` |
| Label / folder | `create_custom_label`, `move_email`, `list_folders` | `mermail-manage-inbox` |
| Mark read | `mark_thread_read`, `bulk_mark_emails_read` | `mermail-manage-inbox` |
| Delete (rare) | `delete_email` + `prepare_destructive_action` | `mermail-manage-inbox` |
| Draft-only automation | `list_task_triagers`, `create_task_triager`, `update_task_triager`, `list_recent_triager_runs` | `mermail-automate-triage` |
| Wallet inspect (read-only) | `get_paybox_connection`, `paybox_get_portfolio`, `paybox_get_request` | `mermail-agent-wallet` (walletScoped) |
| Wallet write (FORBIDDEN here) | `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402` | escalate → `mermail-agent-wallet` / human |

Do not call `set_default_task_triager`. MCP does not auto-fill Reply All. API keys never unlock PayBox; wallet reads need full-profile OAuth.

## Example tool sequence — Earn scan + draft

1. `list_mailboxes` → pick ready mailbox `public_id`
2. `search_emails` with native `query` object (subject/from themes: earn, superteam, bounty, OTP)
3. `get_email` / `get_thread` for clean-scan candidates
4. Classify action / ignore / escalate
5. `save_draft` for action threads
6. Stop for approval before any `reply_to_email` or `forward_email`

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "subject": "earn"
  }
}
```

## Example — OTP surface

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "subject": "OTP"
  }
}
```

Then `get_email` with `agent_safe_content: true` and a bounded `max_body_chars`. Surface code to the user only.

## Example — read-only wallet

1. `tools/call` `get_paybox_connection` once (do not skip because `tools/list` omitted it)
2. If usable/`ACTIVE`, `paybox_get_portfolio`
3. Report balances; **do not** call transfer/swap/x402 tools

## Example — approved reply

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_123",
  "body": {
    "to": "sponsor@example.com",
    "from": "earn-ops@your-mermail-mailbox.example",
    "text": "Thanks — draft submission notes attached for your review. I will not purchase boosts or send funds from this thread."
  }
}
```
