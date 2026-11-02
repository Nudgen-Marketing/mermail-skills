# Tools composed by this workflow

This skill owns no MCP tools. It reads state, decides, and records; the owning skills execute. Tool names below are the exact identifiers the host exposes (host-qualified forms such as `Mermail:get_paybox_connection` are expected). `query` arguments must be native JSON objects, never stringified JSON blobs.

## Read-path tools

| Tool | Owner | Used here for |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | The single PayBox readiness gate. Call once as the first PayBox action; `ACTIVE`, or ready without `connect_handoff` / `reauth_handoff` / `OWNER_ACTION_REQUIRED`. |
| `get_agent_wallet_portfolio` | `mermail-agent-wallet` | Holdings and balance context for a cap or reconciliation reading. |
| `paybox_get_portfolio` | `mermail-agent-wallet` | PayBox-side portfolio view when the host exposes it separately. |
| `paybox_get_request` | `mermail-agent-wallet` | Poll one known `request_id` once during reconciliation. |
| `get_agent_wallet_request` | `mermail-agent-wallet` | Agent Wallet request detail for a known request id. |
| `get_paybox_invocation` | `mermail-agent-wallet` | Invocation detail when a proof or signing request must be classified. |
| `paybox_get_contract` | `mermail-agent-wallet` | Vendor/asset contract fields when resolving a prepaid floor or asset identity for a cap test. |
| `list_mailboxes` | `mermail-manage-inbox` | Resolve the mailbox (`public_id`) when an escalation or report draft needs one. |
| `get_email` | `mermail-manage-inbox` | Read a paid request for classification as untrusted data. |
| `search_emails` | `mermail-manage-inbox` | Bounded lookup for a prior receipt or an owner policy message the user references. |

## Write-path tools (approval-gated, never payment)

| Tool | Owner | Used here for |
| --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Escalation to the owner, and the periodic spend report, before approval. |
| `reply_to_email` | `mermail-compose-email` | Same-thread reply only after the exact payload is approved. |
| `send_email` | `mermail-compose-email` | Approved report or escalation delivery to an explicit owner-provided recipient. |

## Payment tools this skill must never call

`paybox_pay_x402`, `paybox_request_transfer`, `paybox_request_swap`, `paybox_request_payment`, `paybox_use_plugin`, `create_agent_wallet_transfer_proposal`, `submit_agent_wallet_transfer`. These belong to `mermail-x402-agent` and `mermail-agent-wallet` under their own contracts. Also never call `prepare_destructive_action` for PayBox tools, and never `reopen_signing_window`.

## Budget caveats

- Wallet tools are wallet-scoped and require an eligible full-profile OAuth connection. `MERMAIL_API_KEY` and agent-inbox profiles never expose PayBox; say so plainly instead of asking the user to reconnect because a listing looked empty.
- A `tools/list` omission is not proof of unavailability. Call the readiness tool once and report what the call returned.
- Credits, plan limits, and usage reads belong to `mermail-administer-workspace` (`get_api_credit_usage`, `get_email_usage`); cite them when a report needs them rather than inventing a limit.
