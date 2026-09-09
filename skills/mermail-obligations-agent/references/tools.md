# Tools — Mermail Obligations Agent

This skill claims **no** tool ownership in `tool-coverage.json`. It is registered under
`infrastructureSkills` and routes to existing owners, as permitted by `CONTRIBUTING_A_SKILL.md`.
Every tool below stays owned by the skill in the right-hand column.

## Call Envelope

Mermail business tools take `mailboxId` plus a loose `query` / `body` envelope, with
`idempotencyKey` available on writes. `query` and `body` accept arbitrary keys, so the schema will
not reject a wrong field name — it will silently do nothing useful.

**Read the live tool schema before the first call of each kind and use the field names it returns.**
Do not carry field names over from documentation or from another skill. Pass `query` values as
native JSON objects, never as stringified JSON.

## Discovery and Register

| Tool | Use here | Owner |
| --- | --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace | `mermail-administer-workspace` |
| `list_mailboxes` | Resolve the mailbox and preserve its `public_id` as `mailboxId` | `mermail-administer-workspace` |
| `list_folders` | Check register folders before creating | `mermail-manage-inbox` |
| `create_folder` | Create missing register folders, once | `mermail-manage-inbox` |
| `search_emails` | Find attachment-bearing candidates; rebuild the register via the `folder` filter; retrieve counterparty history | `mermail-manage-inbox` |
| `list_emails` | Fallback newest-first enumeration | `mermail-manage-inbox` |
| `get_email` | Metadata, then bounded clean content after selection | `mermail-manage-inbox` |
| `get_email_context` | Prior correspondence for payment history only, after selection | `mermail-manage-inbox` |
| `download_attachment` | Retrieve the document the deadline is extracted from | `mermail-manage-inbox` |
| `move_email` | **The register write.** Every state transition is a move | `mermail-manage-inbox` |

`update_email` is deliberately absent. It accepts only read and starred state and cannot express
obligation state. Manual custom-label assignment is not exposed in this catalog; never synthesize a
tool name or approximate it with `update_email`.

`bulk_move_emails` is available but unused: obligations move one at a time so each transition is
individually evidenced.

## Reminders

| Tool | Use here | Owner |
| --- | --- | --- |
| `save_draft` | Build the ladder-rung reminder for preview | `mermail-compose-email` |
| `send_email` | Send after explicit approval of that exact draft | `mermail-compose-email` |
| `reply_to_email` | Reply in-thread when the obligation has live correspondence | `mermail-compose-email` |

`schedule_email_send` is not used. Rungs are computed and previewed at run time so the user sees
the message before it goes out; scheduling would place mail beyond the preview-then-approve
contract.

## Settlement

Wallet-scoped and OAuth-only. The connection is owner-only and never established by this skill.

| Tool | Use here | Owner |
| --- | --- | --- |
| `get_paybox_connection` | Confirm a wallet is connected before offering settlement | `mermail-agent-wallet` |
| `get_agent_wallet` | Read connection, balances, limits, and request state | `mermail-agent-wallet` |
| `list_agent_wallet_credentials` | Resolve the delegated `credential_id` for the transfer | `mermail-agent-wallet` |
| `paybox_request_transfer` | Open the PayBox signing window for a reconciled USDC payable | `mermail-agent-wallet` |
| `get_agent_wallet_request` | Poll the returned request id before any retry decision | `mermail-agent-wallet` |

`paybox_request_transfer` takes `credential_id`, `chain`, `to`, `amount`, and optional `token`. It
settles USDC on Base or Solana and performs no conversion. It has no propose/reject pair: the
signing window is the approval surface, and the user authorises there. **The skill's defence is
therefore not to call it** — a failed reconciliation means no transfer tool is invoked at all.

`create_agent_wallet_transfer_proposal`, `submit_agent_wallet_transfer`, and
`reject_agent_wallet_transfer_proposal` are deprecated compatibility shims and owner-only. This
skill does not use them.

`get_agent_wallet_portfolio` is not used; balance reads go through `get_agent_wallet`, matching
what `mermail-agent-wallet` documents.

## Not Used

`create_mailbox`, `delete_email`, `bulk_delete_emails`, `empty_trash`, `delete_folder`,
`update_email`, custom-label tools, `paybox_request_swap`, `paybox_pay_x402`, and the Composio
catalogue are outside this workflow. If a task needs them, hand off to the owning skill.
