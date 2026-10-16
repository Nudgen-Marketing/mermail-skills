# Mermail tool surface used by this desk

Connect the Mermail MCP server (`POST https://console.mermail.app/mcp`, OAuth with `scope=mcp:tools`) or use the REST API with an `x-api-key`. The desk needs these capabilities:

| Desk step | Tool / endpoint | Notes |
| --- | --- | --- |
| List mailboxes | `list_mailboxes` / `GET /api/v1/mailboxes` | discover the desk inbox once, reuse its id |
| Read threads | inbox/thread listing + `GET .../emails/{id}` | intake reads full thread history |
| Save draft | `save_draft` / `POST .../drafts` | quotes, re-quotes, follow-ups |
| Send / reply / forward | `send_email`, `reply_to_email`, `forward_email` | per send rules in policy |
| Schedule follow-up | `schedule_email_send` / `POST .../scheduled-sends` | polite follow-up after the policy window |
| Attachments | `attachments` array on send/draft | deliverables from the job folder; base64 content, ≤20 files, ≤10 MiB each, ≤25 MiB total |
| Wallet activity | Agent Wallet / x402 receipts | `Payment-Receipt` headers, wallet history — reconcile against `ledger.csv` |

## Contracts to respect

- **x402/MPP**: paid endpoints return a 402 challenge; retry the identical request with the payment credential, keep app auth on every retry, store the returned `Payment-Receipt`. The desk only *receives* — outbound payment approval is human-only.
- **Attachments**: canonical base64 without data-URL prefix; no local paths or remote URLs as inputs; failed sends keep a recoverable draft.
- **Drafts**: `source_draft_id` preserves a draft's files on send; `[]` clears attachments — always set the array explicitly.
- **Limits**: 40 MiB request-body cap outbound; rate limits per plan (Free: 10 RPM) — batch intake reads, don't hammer.
- **Errors**: a failed send preserves files for retry — report failure with the draft id, don't re-blind-send.
