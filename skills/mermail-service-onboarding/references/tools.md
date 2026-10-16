# Service onboarding tools

This persona **uses** tools owned by other official skills. Do not add them to
this skill in `tool-coverage.json` — this skill owns no tools. Pass structured
arguments as **native JSON objects**. Never stringify `query` or `body`. Use
the exact host identifier exposed by the current host (for example
`Mermail:search_emails`); do not manually add, strip, or invent host prefixes.
Prefer the mailbox `public_id` as `mailboxId`.

## Mailbox (owner: `mermail-agent-inbox`)

| Tool | Role in this workflow |
| --- | --- |
| `list_workspaces` | Resolve the authenticated workspace before any mailbox work |
| `list_mailboxes` | Discover an existing service mailbox before provisioning |
| `create_mailbox` | Provision the one service-scoped mailbox for this run |
| `search_emails` | Poll for the expected verification mail (bounded, metadata-first) |
| `get_email` | Read the single matched verification message |

## Wallet / PayBox (owner: `mermail-agent-wallet`)

| Tool | Role in this workflow |
| --- | --- |
| `get_paybox_connection` | Probe wallet availability before claiming PayBox tools are missing |
| `paybox_get_buy_link` | Console funding deep link when onramping is required |
| `paybox_request_transfer` | Prepare a one-off plan payment inside the owner's stated limit |
| `paybox_request_swap` | Swap to the payment asset when the plan is not USD-denominated |
| `paybox_pay_x402` | Pay an x402-gated plan; see `mermail-x402-agent` for the full contract |

PayBox tools appear only on the full-profile MCP **OAuth** connection. API-key
and agent-inbox profiles never expose them. Always call `get_paybox_connection`
once before asking the owner to reconnect; absence of a `paybox_*` tool from a
first `tools/list` glance is not proof it is unavailable.

## Receipt (owner: `mermail-manage-inbox`)

| Tool | Role in this workflow |
| --- | --- |
| `move_email` | File the confirmation/invoice into the agreed folder |
| `create_custom_label` / `update_custom_label` | Tag the receipt so later workflows can find it |
| `get_email` | Verify the filed receipt's content before reporting success |

Read live schemas from `tools/list` after a usable connection probe; do not
assume argument shapes from memory.
