# Tools

This skill is a **read-only workflow** over tools owned by `mermail-administer-workspace` (`list_mailboxes`) and `mermail-manage-inbox` (`list_emails`, `search_emails`, `get_email`). It claims no exclusive tool ownership — see `tool-coverage.json`. Keep ownership unique there; this skill only recombines existing read tools.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it; the mailbox email address is also accepted.

## Tool notes

| Tool | Purpose | Risk |
| --- | --- | --- |
| `list_mailboxes` | Discover the opportunity mailbox (1 API credit) | read |
| `list_emails` | Bounded poll of recent messages (1 credit). Note: list-response bodies are truncated (~300 chars) | read |
| `search_emails` | Keyword pre-filter when the inbox is large (1 credit) | read |
| `get_email` | Fetch one full message for classification and extraction (1 credit) | read |

No send, write, or destructive tools are used. There is no code path in this skill that calls `send_email`, applies to an opportunity, or spends funds.

## REST equivalents (verified live on Mermail Free)

Base URL: `https://console.mermail.app`, auth header `x-api-key: $MERMAIL_API_KEY`.

| Operation | Request | Cost |
| --- | --- | --- |
| Discover mailbox | `GET /api/v1/mailboxes` | 1 credit |
| List messages | `GET /api/v1/mailboxes/{mailboxId}/emails?limit=50` | 1 credit |
| Fetch one message | `GET /api/v1/mailboxes/{mailboxId}/emails/{emailId}` | 1 credit |

Free tier: ~10 RPM (console Billing tab is authoritative), 1,000 credits/period. Space read calls ≥7s apart; back off on `429`.
