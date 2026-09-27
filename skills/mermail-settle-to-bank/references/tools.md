# Tools and the route

This skill owns no Mermail tools. It reads the inbox through the mail skills and moves money through the agent wallet skill, then calls the settlement provider for the one step Mermail does not cover: money arriving in a bank account.

## Route

| Step | Owner | Tools |
| --- | --- | --- |
| Find the request | `mermail-manage-inbox` | `list_emails`, `get_email`, `get_thread` |
| Check the money | `mermail-agent-wallet` | `get_paybox_connection`, `get_agent_wallet_portfolio` |
| Convert, only if the human approves it separately | `mermail-agent-wallet` | `paybox_request_swap` |
| Pay the provider | `mermail-agent-wallet` | `paybox_request_transfer` or `paybox_pay_x402` |
| Reply with the receipt | `mermail-compose-email` | `reply_to_email` (external effect, own approval) |

Do not duplicate ownership of any tool above. Route to the owning skill.

## Settlement provider interface

Four calls, provider-agnostic:

- `beneficiaries.list()` — the approved destinations. Read-only from this skill.
- `quote(beneficiaryId, amount, asset)` — amount out, rate, fee, expiry, and the address to pay.
- `send(quoteId, idempotencyKey)` — pay the quoted address, then hand the reference back.
- `status(reference)` — sent, pending, failed, or unknown.

A provider that cannot express all four does not belong behind this skill.

## Approval classes

| Action | Class |
| --- | --- |
| Read balances, quotes, beneficiary list | `none` |
| Swap before a payout | `external-effect`, previewed on its own |
| Pay the provider | `external-effect`, exact preview, fresh approval |
| Reply on the thread with a receipt | `external-effect` |
| Adding or editing a beneficiary | not available to the agent, human-only, out of band |
