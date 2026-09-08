# Mermail MCP Tools — Signup Agent Reference

The skill composes **existing** Mermail MCP tools only. It never declares new tools; ownership of every tool stays with its canonical skill (see repo `tool-coverage.json`).

## Connection
- MCP endpoint: `https://console.mermail.app/mcp?profile=agent-inbox` (least-privilege profile for verification work).
- Auth: `Authorization` header with the agent API key from env `MERMAIL_API_KEY`. Never paste keys in chat.

## Tools used (canonical owners)
| Tool | Owner skill | Role in signup flow |
|---|---|---|
| `list_workspaces` | mermail (router) | Resolve the credential-bound workspace before anything else. |
| `list_mailboxes` | mermail-manage-inbox | Resolve-before-create: find an existing verification-mode inbox for this service. |
| `create_mailbox` | mermail-manage-inbox | Provision a service-scoped inbox when none exists. Send an `Idempotency-Key`; creation consumes provision credits. |
| `list_emails` | mermail-agent-inbox | Bounded polling of the inbox for the expected verification mail. |
| `search_emails` | mermail-agent-inbox | Correlate by sender/subject when the inbox has traffic. |
| `get_email` | mermail-agent-inbox | Read the matched message for OTP/link extraction. |

Not used here: `save_draft`, `send_email`, `mermail-compose-email` toolset, wallet tools, triager tools, Composio tools.

## Call shapes (illustrative)
```
list_workspaces({})
list_mailboxes({})
create_mailbox({ purpose: "verification:<service>:<task>", automations: false, Idempotency-Key: "<uuid>" })
list_emails({ mailboxId, since, limit: 20 })
get_email({ mailboxId, emailId })
```
Pass `workspaceId`/`mailboxId` exactly as returned; never invent IDs.

## Polling policy
- Interval 15–30 s, hard deadline 5 min default, 15 min max, then report `pending` and stop.
- A message matches only if sender domain AND subject pattern match the signup plan. All other mail is quarantined-by-default (never opened, never acted on).
