# Tool reference — mermail-crypto-payout-reconciler

This skill **composes** tools owned by other skills. It owns none.

## Inbox (owned by `mermail-manage-inbox`)

Host-qualified forms (as exposed by the host) and bare forms both accepted by most clients; use exactly what your host exposes.

| Tool | Purpose here | Notes |
|---|---|---|
| `Mermail:search_emails` / exact host-exposed identifier | Find payout-claim emails | Native envelope example: `{ "mailboxId": "MAILBOX_PUBLIC_ID", "query": { "subject": "payout", "page": 1, "limit": 50, "metadata_only": true, "agent_safe_content": true } }`. Never stringify `query`; resolve the owner-authorized mailbox first. |
| `Mermail:list_emails` / `mermail_list_emails` | Page candidates | Bounded: `limit` ≤ 50 per call |
| `Mermail:get_email` / exact host-exposed identifier | Read one selected candidate | `{ "mailboxId": "MAILBOX_PUBLIC_ID", "emailId": "EMAIL_ID", "query": { "require_scan_status": "clean", "agent_safe_content": true, "max_body_chars": 10000 } }`. Inspect returned `sender_authentication.status`; only `"pass"` counts. Withheld, truncated, unknown or unavailable safe content is a gap, never paste it back. |

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
- The offline helper never inspects chain state. It validates formats and exact owner-list labels only, not EVM network IDs/token contracts/settlement. No OAuth or provider was exercised by its CLI tests. Total intake is 50 emails per run, not 50 on every unlimited page; stop at the recorded budget or any authorization/rate/credit failure.
