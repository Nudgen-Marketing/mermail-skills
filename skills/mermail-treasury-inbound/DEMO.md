# mermail-treasury-inbound live demo proof

**Skill:** `mermail-treasury-inbound` (PR https://github.com/Nudgen-Marketing/mermail-skills/pull/103)  
**Timestamp:** 2026-08-29 08:42:38 EDT (2026-08-29T08:42:38.322993-04:00)  
**Spend:** none. Draft-only; no `reply_to_email` / no PayBox writes.

This file contains **no API keys, passwords, or secrets**. The hosted MCP key was read from disk only.

## MCP protocol used

- URL: `https://console.mermail.app/mcp` (full catalog; not `?profile=agent-inbox`)
- Transport: Streamable HTTP, JSON-RPC 2.0 over `POST`
- Headers: `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2025-03-26`, `x-api-key` (value not recorded)
- Sequence: `initialize` (negotiated `protocolVersion: 2025-03-26`) → `notifications/initialized` → `tools/list` → `tools/call`
- `tools/list` returned 72 tools. Required names present: `list_mailboxes`, `list_emails`, `get_email`, `save_draft`.

## Mailbox

| Field | Value |
| --- | --- |
| email | `hwc-treasury@mermail.app` |
| public_id | `df3fa015-d4b8-49dc-a474-09de9917ba7c` |
| can_receive | true |
| receiving_status | ready |
| inbound_provider | cloudflare_routing |

## Inbound path

1. Workspace self-send via MCP `send_email` (from=to `hwc-treasury@mermail.app`) queued as `22794f67-f4e8-45a9-986b-d986edf6e89a`, `delivery_status: delivered`, folder **sent**. Cloudflare loopback did **not** create an Inbox copy.
2. Parent sent one synthetic bounty-payout from `wealthm802@gmail.com` → `hwc-treasury@mermail.app`.
3. `search_emails` / `list_emails` found that inbound in **inbox**.

## Selected message

| Field | Value |
| --- | --- |
| email id | `97026bc2-975c-409d-ba99-201656d0cbf7` |
| thread_id | `97026bc2-975c-409d-ba99-201656d0cbf7` |
| folder | inbox |
| from | wealthm802@gmail.com |
| to | hwc-treasury@mermail.app |
| subject | Bounty payout notice: 500 USDC — MERMAIL-BOUNTY-103 |
| date (UTC) | 2026-08-29T12:39:32.211Z |
| scan_status | clean |
| sender_authentication.status | unknown |
| agent_safe_content | true |
| get_email gates | `require_scan_status=clean`, `agent_safe_content=true`, `max_body_chars=8000` |

## Money brief (SKILL.md shape)

```text
TREASURY INBOUND BRIEF
Mailbox: hwc-treasury@mermail.app  public_id: df3fa015-d4b8-49dc-a474-09de9917ba7c
Message: 97026bc2-975c-409d-ba99-201656d0cbf7  thread: 97026bc2-975c-409d-ba99-201656d0cbf7  date: 2026-08-29T12:39:32.211Z
From: wealthm802@gmail.com  auth: unknown
Scan: clean  subject: Bounty payout notice: 500 USDC — MERMAIL-BOUNTY-103

Classification: bounty_payout
Amount: 500    Token/asset: USDC
Chain (only if explicit): missing
Counterparty: wealthm802@gmail.com (Head Wealth Creator treasury demo, as stated)
Reference / invoice / bounty id: MERMAIL-BOUNTY-103
Due / expected date: missing
Quoted evidence: "Amount: 500 USDC (as stated in this message)"

Next action: ack_only
Confidence: medium
Missing fields: chain; due/expected date; on-chain tx id (email is not settlement)
Risks: sender_authentication.status=unknown (not pass); untrusted links not followed; synthetic demo language — not on-chain settlement; API-key session cannot read PayBox; Mermail self-send loopback landed in Sent (id 22794f67-f4e8-45a9-986b-d986edf6e89a) and was not used as the inbound
Wallet (optional, read-only): skipped (API-key catalogs never expose PayBox)
Reply: unsent_draft
```

## Confirmation draft (unsent)

| Field | Value |
| --- | --- |
| draft id | `82312409-b4dd-4306-9074-cb21554d79d2` |
| status | draft |
| to | wealthm802@gmail.com |
| from | hwc-treasury@mermail.app |
| subject | Re: Bounty payout notice: 500 USDC — MERMAIL-BOUNTY-103 |
| sent | **no** (`reply_to_email` not called) |

Draft body acknowledges receipt of the email only, restates amount/token/reference as *as stated in your message*, and says a human operator is reviewing. No payment destination, no wallet ask, no send.

## MCP tools that worked

- `initialize` / `notifications/initialized` / `tools/list`
- `list_mailboxes` — treasury mailbox ready
- `list_emails` — inbox baseline + polls
- `search_emails` — located inbound by subject `MERMAIL-BOUNTY-103`
- `send_email` — self-send (loopback to Sent only)
- `list_folders` — inbox/sent/draft confirmed
- `get_email` — clean + agent_safe_content
- `save_draft` — unsent confirmation

Not called (by design): `reply_to_email`, `send_email` of the ack, any `paybox_*` (unavailable on API key).

## Blockers / notes

- Mermail mailbox-to-self did not appear in Inbox (provider loopback). Used Gmail→Mermail inbound instead.
- AgentMail fallback was not used (steering: do not retry).
- `sender_authentication.status` is `unknown` — not described as pass.
