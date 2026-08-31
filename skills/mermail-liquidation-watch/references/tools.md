# Tools this skill routes to

This skill owns no MCP tools. It composes tools owned by focused skills, and
follows their argument, approval, and retry contracts unchanged.

## Mailbox reads — owned by `mermail-manage-inbox`

| Tool | Use here |
|---|---|
| `list_mailboxes` | Resolve the agent's mailbox. Prefer `public_id` as `mailboxId`. |
| `get_thread` | Fetch the thread the agent itself sent, to look for the operator's reply. This is the only thread whose replies can approve anything. |
| `search_emails` | Narrow to that thread when the id must be recovered. The `query` argument is a native JSON object — never a stringified one. |
| `get_email` | Read the reply body to confirm the approval matches the proposal. |

## Mail sends — owned by `mermail-compose-email`

| Tool | Use here |
|---|---|
| `send_email` | Send the alert with the exact repay preview to the operator's configured address. External effect: preview once, send once. |
| `reply_to_email` | Reply on the same thread with the verified unsigned repay, or with a phishing report. |
| `schedule_email_send` | Optional digest of a quiet period. Not part of the alert path. |

## Wallet — owned by `mermail-agent-wallet`

| Tool | Use here |
|---|---|
| `get_paybox_connection` | Always the first PayBox action, called once. Absence of `paybox_*` from a host `tools/list` is not "not exposed". |
| `paybox_get_portfolio` | Check whether the borrow wallet holds enough of the borrowed token. |
| `paybox_request_transfer` | Move the operator's own funds to the operator's own borrow wallet when short. Wallet-destructive; PayBox owns approval and signing. |
| `paybox_get_buy_link` | Offer when the operator has no funds to move. |

Never claim `MERMAIL_API_KEY` can authorize PayBox. API-key and agent-inbox
profiles never expose PayBox; the wallet leg needs a full-profile OAuth
session.

## The health and repay source

Position health and repay preparation come from an on-chain source outside
Mermail, configured by the operator. It must provide, per reading:

- current LTV, liquidation LTV, and distance to liquidation
- the borrowed token, so the alert can name what to repay
- freshness evidence — how far behind chain head the snapshot is
- a preparation path returning an **unsigned** instruction set, with its own
  independent verification that the instructions are a repay of the approved
  amount, on the approved position, owned by the operator's wallet

A reference implementation of that contract is Sentinel
(https://github.com/christianpichichero-max/zeroclaw-sentinel), which reads
Kamino lending health and prepares unsigned repays, refusing any instruction
set carrying a foreign program, a wrong owner, a wrong reserve, or a wrong
amount. Any source meeting the contract above works.

Sentinel exposes the same two contracts as WASM plugins and as dependency-free
Python scripts, `tools/kamino_health.py` and `tools/prepare_repay.py`. Either
satisfies this skill; the scripts need no toolchain, so they are the quicker
way to reproduce the workflow in a new client.

One argument is worth passing deliberately. Give the repay preparation the
borrowed token's decimals. Without them an amount can only be checked against
some power of ten, and an approval of 25 is indistinguishable from a hundred
times that at a different token scale. The decimals are known once health has
been read, so there is never a reason to omit them.
