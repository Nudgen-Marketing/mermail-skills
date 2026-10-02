# Tools

This skill owns no MCP tools. It routes to the official owning skills and follows their contracts exactly. Do not invent tool names — every identifier below already exists on the hosted Mermail MCP server.

## Mermail tools (via owning skills)

| Tool | Owner skill | Purpose in this workflow |
| :--- | :--- | :--- |
| `list_mailboxes` | `mermail-manage-inbox` | Resolve the destination mailbox; prefer `public_id` as `mailboxId` |
| `search_emails` / `list_emails` | `mermail-manage-inbox` | Find the previous digest thread (de-duplication) or a stored radar profile |
| `get_email` | `mermail-manage-inbox` | Read a prior digest to extract already-delivered item IDs |
| `send_email` | `mermail-compose-email` | Deliver the digest now (`body.html` and/or `body.text`) |
| `save_draft` | `mermail-compose-email` | Stage the digest when the user wants to review in the client first |
| `schedule_email_send` | `mermail-compose-email` | Recurring cadence (string `body.body`, `scheduled_send_at` ISO-8601 UTC) |

Mailbox discovery and send flows follow `mermail-manage-inbox` / `mermail-compose-email` exactly, including their approval and retry contracts.

## External source APIs (plain HTTPS, no credentials)

| Source | Endpoint | What it returns |
| :--- | :--- | :--- |
| Superteam Earn | `GET https://superteam.fun/api/listings` | Open bounties/hackathons: title, `rewardAmount`, `token`, `type`, `agentAccess`, `deadline`, `slug`, `sponsor` |
| GitHub | `GET https://api.github.com/search/issues?q=label:bounty+state:open+...` | Open bounty-labeled issues on repos with verifiable payout history |

Both are unauthenticated. GitHub allows 60 req/hour without a token — one search per source per run stays far under the limit. Never send credentials to these endpoints.

## Tool-selection rules

- Reads before writes: resolve mailbox and prior digests before composing anything.
- One digest = one send. Never send per-item emails.
- If a Mermail tool is unavailable (wrong profile, missing scope), stop and report — do not substitute a different channel (no Gmail/Outlook, no direct SMTP).
