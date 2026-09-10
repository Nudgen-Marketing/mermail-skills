# Tool contract (no ownership)

This skill **owns none** of the Mermail MCP catalog. Prefer existing owners:

| Intent | Prefer skill / tools | Effect |
| --- | --- | --- |
| List workspaces / mailboxes | `list_workspaces`, `list_mailboxes` | Read |
| Search / list / get mail | `search_emails`, `list_emails`, `get_email`, `get_email_context` | Read |
| Save unsent archive | `save_draft` (`mermail-compose-email`) | Internal write |
| Send / reply | `send_email`, `reply_to_email` | External effect — exact preview + fresh approval |
| OTP / verification mailbox | Route to `mermail-agent-inbox` | — |
| Agent Wallet / x402 | Route to `mermail-agent-wallet` / `mermail-x402-agent` | Wallet-scoped |

## Rules

- Pass MCP `query` / `body` values as native JSON objects, never stringified JSON.
- Prefer mailbox `public_id` as `mailboxId`.
- Do not invent tool names. If a needed tool is missing from the live catalog, stop and report.
- For `save_draft`, composition content uses string field `body.body`. For send/reply, use `body.html` and/or `body.text` plus required `body.from` (see compose skill references).
- Idempotency keys: reuse only for identical method/path/body; never retry an ambiguous external effect with a new key.

## Suggested draft archive shape

Subject: `earn/<listing-slug> packet`

Body (markdown or text) includes: listing URL, reward, deadline, demo, source, write-up, wallet, blockers, timestamp UTC.
