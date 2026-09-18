# Tool reference — mermail-crypto-payout-reconciler

This skill **composes** tools owned by other skills. It owns none.

## Inbox (owned by `mermail-manage-inbox`)

Host-qualified forms (as exposed by the host) and bare forms both accepted by most clients; use exactly what your host exposes.

| Tool | Purpose here | Notes |
|---|---|---|
| `Mermail:search_emails` / `mermail:search_emails` | Find payout-claim emails | `query` must be a **native JSON object**, never a stringified blob. Example: `{ "mailbox": "inbox", "query": "subject:payout", "limit": 50 }` |
| `Mermail:list_emails` / `mermail_list_emails` | Page candidates | Bounded: `limit` ≤ 50 per call |
| `Mermail:get_email` / `mermail_get_email` | Fetch body + headers + `sender_authentication` | Always request auth status; `sender_authentication.status` must be `"pass"` |

## Compose (owned by `mermail-compose-email`)

| Tool | Purpose here | Notes |
|---|---|---|
| `Mermail:save_draft` / `save_draft` | Draft (never send) receipt/ack emails | Drafts only; sending requires explicit owner approval per draft |
| `Mermail:reply_to_email` / `reply_to_email` | Send an approved draft | **Human-in-the-loop**: exact preview + fresh approval; never called by this skill autonomously |

## Wallet (owned by `mermail-agent-wallet`)

| Tool | Purpose here | Notes |
|---|---|---|
| Read-only PayBox state inspection | Cross-check a claimed wallet against known PayBox state (optional) | Never call `paybox_request_transfer`, `paybox_request_swap`, or any `walletDestructiveTools`. This skill never moves funds. |

## Credit / scope caveats

- All tools are subject to the workspace plan, RPM limits, and available credits.
- API-key auth cannot reach wallet-scoped tools; reconciliation of on-chain state beyond format validation is best-effort without full-profile OAuth.
