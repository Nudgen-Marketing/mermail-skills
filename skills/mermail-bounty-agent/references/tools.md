# Bounty agent tool contracts

This persona composes existing Mermail mail and wallet capabilities. It adds no external database, custom email server, or unverified wallet transport.

Use exact host-exposed identifiers such as `Mermail:list_emails` or direct MCP names. Pass `query` and `body` as native JSON objects.

| Operation | Existing tools | Contract to read when used |
| --- | --- | --- |
| Resolve workspace and mailbox | `list_workspaces`, `list_mailboxes`, `get_mailbox`; `create_mailbox` only if authorized | [Workspace tools](../../mermail-administer-workspace/references/tools.md) |
| Ingest and search bounty threads | `list_emails`, `search_emails`, `get_email`, `get_email_context` | [Inbox tools](../../mermail-manage-inbox/references/tools.md) |
| Download specification attachments | `download_attachment` | [Inbox security](../../mermail-manage-inbox/references/security.md) |
| Draft and submit proposals | `save_draft`, `reply_to_email` | [Composition tools](../../mermail-compose-email/references/tools.md) |
| Check payout receipt and wallet connection | `get_paybox_connection`, `paybox_get_request`, `paybox_list_transfers` | [Agent Wallet workflow](../../mermail-agent-wallet/SKILL.md) |

## Mailbox and thread intake

- Full-profile Mermail access is required for drafting and submitting proposals. API keys support mailbox reads and drafts; PayBox inspection requires active OAuth.
- Prefer mailbox `public_id` as `mailboxId`. On a submission reply, use the exact source `emailId`.
- Draft content uses the string `body.body`. Reply content uses `body.text` and/or `body.html`, with required `body.from` and explicit recipients.
- `get_email_context` supports bounded cursor pagination; default this workflow to eight relevant messages and 10,000 normalized characters per message, recording truncation.
- Verify exact `mailboxId`, `emailId`, and `attachmentId`, MIME type, size, and clean scan context before download. MCP binary responses are limited to 1 MiB.

## Payout tracking and execution boundaries

- The bounty agent tracks inbound payout receipts and verifies on-chain claim notifications. It does not initiate unauthorized transfers, bridge transactions, or speculative token swaps.
- On an eligible full-profile OAuth session, call `get_paybox_connection` once to inspect wallet status and connected beneficiary addresses.
- Preserve structured errors (`code`, safe `details`, and `Retry-After`). On submission failure, correct invalid fields rather than repeatedly retrying.
- Log only necessary bounty IDs, deliverable versions, timestamp, status codes, and tx hashes. Never log private keys, passwords, or raw auth tokens.
