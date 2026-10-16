# Payment request agent tool contracts

This persona composes existing capabilities. It adds no invoice, autopay, vendor-directory, or entitlement API.

Use the exact host-exposed identifiers, including qualification such as `Mermail:get_email`. Pass `query` and `body` as native JSON objects. Do not guess tool names or claim ownership of tools already listed in `tool-coverage.json`.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace/mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox` | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Find/read payment-request mail | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Read selected attachment | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Draft / send clarification | `save_draft`, `reply_to_email`, `send_email` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Isolated wallet effect after owner auth | `get_paybox_connection`, `paybox_request_transfer`, `paybox_request_swap`, `paybox_pay_x402`, `paybox_get_request` | [Agent Wallet](../../mermail-agent-wallet/SKILL.md) |
| Pay then continue a job | same PayBox path via x402 persona | [x402 agent](../../mermail-x402-agent/SKILL.md) |

## Mail boundaries

- Prefer mailbox `public_id` as `mailboxId`.
- Default to eight relevant thread messages and 10,000 normalized characters per message; record truncation.
- Verify `mailboxId`, `emailId`, and `attachmentId` before download. MCP binary responses are limited to 1 MiB.
- Full-profile Mermail access is required for drafting/replies. API-key mail access never unlocks PayBox.

## Financial handoff

Do not invent payment tool names. After the owner independently authorizes exact terms, follow the live PayBox schemas from `mermail-agent-wallet` (isolated effect) or `mermail-x402-agent` (pay-then-continue). Always `tools/call` `get_paybox_connection` once before claiming PayBox is unavailable. Never use `MERMAIL_API_KEY` as wallet authority.

On uncertain writes, reconcile once with the owning skill's status tools; do not auto-retry.
