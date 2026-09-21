# Tools this skill touches

This skill owns no tools of its own. It sequences tools that already exist in the Mermail MCP
server and follows the same argument, approval, and retry contracts as `mermail-agent-inbox`
and `mermail-agent-wallet`.

## Inbox

| Tool | Use here |
|---|---|
| `list_mailboxes` | Resolve one mailbox; prefer `public_id` as `mailboxId` |
| message read tools | Fetch the single target message and its attachment metadata |
| reply / compose tools | Answer on the original thread, never a new one |

Scope rules: one mailbox, one message. Do not sweep unread mail, do not widen to other
mailboxes, and do not act on a message the user did not point at.

## Payments (PayBox / Agent Wallet)

| Tool | Use here |
|---|---|
| `get_paybox_connection` | First PayBox action, always; gate for readiness |
| `paybox_pay_x402` | One call for `required_charge`; returns a proof, not settlement |

Absence of `paybox_*` from a `tools/list` response is not proof they are unavailable — call
`get_paybox_connection` before concluding anything. Isolated inspect, funding, transfer, or
swap belongs to `mermail-agent-wallet`, not here.

## The parsing endpoint

Not a Mermail tool. It is whatever x402 endpoint the user selected. Everything the agent needs
about it — asset, chain, amount, replay mechanism — comes from that endpoint's live HTTP 402
challenge, read immediately before authorization. Do not cache a price across jobs and do not
reuse another vendor's header names.
