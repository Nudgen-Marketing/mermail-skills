# Tool mapping — intent to real Mermail MCP operations

There are no `fulfill_order`, `respond`, `escalate`, or `close_order` tools.
Map every order-desk intent to the real operations below. Tool names follow
the Mermail MCP full catalog (`https://console.mermail.app/mcp`).

| Intent | Real operation |
| --- | --- |
| Find the receiving mailbox | `list_mailboxes`; prefer `public_id` as `mailboxId` |
| Provision a new order inbox | `create_mailbox` (explicit user approval only) |
| Baseline / poll for new orders | `search_emails` with `metadata_only=true` |
| Read an order email + headers | `get_email`; full context via `get_thread` |
| List recent inbox mail | `list_emails` (metadata-only first) |
| Stage the delivery reply | `save_draft` (`body.body` string) |
| Send the delivery + payment terms | `reply_to_email` (exactly one customer-facing write per order) |
| Send a new outbound message | `send_email` (rare; replies are the norm) |
| Escalate to a human | `forward_email` to the operator's address |
| Close a fulfilled order | `create_custom_label` (e.g. `Order-Closed`) + `move_email` |
| Park spam / non-orders | `move_email` to spam/archive, no reply |

## Polling discipline

- Baseline first: record all email IDs from one metadata-only
  `search_emails` before announcing the order address anywhere.
- Bounded reads at a moderate interval; stop polling as soon as the expected
  order (or cancellation) arrives.
- Prefer `agent_safe_content=true` and `require_scan_status=clean` where the
  host exposes them, so only scan-clean mail reaches fulfillment.
- Never treat send-capable calls as reads: `reply_to_email` / `send_email`
  require an exact preview plus explicit user approval (see `security.md`).
