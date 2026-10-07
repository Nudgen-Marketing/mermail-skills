# Tool map

This persona skill owns no MCP tools. It composes official tools from `mermail-manage-inbox`, `mermail-compose-email`, `mermail-administer-workspace`, and `mermail-agent-wallet`. All tool invocations must follow their respective canonical parameter, risk, and authorization contracts.

## Composed Mermail tools

| Tool | Owner skill | Risk | Purpose in this workflow |
| :--- | :--- | :--- | :--- |
| `list_mailboxes` | `mermail-manage-inbox` | read | Resolve workspace mailboxes; prefer `public_id` as `mailboxId` |
| `search_emails` | `mermail-manage-inbox` | read | Find client project threads, milestone agreements, and invoice correspondence |
| `list_emails` | `mermail-manage-inbox` | read | Inspect inbound mailbox traffic for client milestone updates and notifications |
| `get_email` | `mermail-manage-inbox` | read | Read sanitized email content, headers, and attachments for clean messages |
| `get_email_context` | `mermail-manage-inbox` | read | Read bounded, chronological thread context for active milestone discussions |
| `save_draft` | `mermail-compose-email` | write | Save an unsent milestone delivery or quote draft for owner review |
| `send_email` | `mermail-compose-email` | external-effect | Send an owner-approved milestone invoice or final settlement receipt |
| `reply_to_email` | `mermail-compose-email` | external-effect | Reply to an existing client thread with delivery manifests and payment links |
| `list_folders` | `mermail-manage-inbox` | read | List existing mailbox folders to locate desk organization folders |
| `create_folder` | `mermail-manage-inbox` | write | Provision desk folders (`Milestones Active`, `Milestones Needs Owner`, `Milestones Settled`) |
| `move_email` | `mermail-manage-inbox` | write | Organize milestone threads by state without destructive deletion |
| `get_workspace` | `mermail-administer-workspace` | read | Inspect workspace status, public ID, and active profile |
| `get_paybox_connection` | `mermail-agent-wallet` | read | Probe PayBox connection and discover model-visible live wallet capabilities |
| `get_agent_wallet` | `mermail-agent-wallet` | read | Inspect wallet configuration, network, and operational status |
| `get_agent_wallet_portfolio` | `mermail-agent-wallet` | read | Check USDC balances and available assets before split distributions |
| `paybox_get_request` | `mermail-agent-wallet` | read | Authoritatively reconcile payment status for a specific milestone invoice request |
| `paybox_request_transfer` | `mermail-agent-wallet` | wallet-destructive | Execute owner-approved collaborator split transfer in exact 6-decimal micro-units |

## Tool execution rules

- **Native JSON objects**: Always pass `query` and `body` arguments as native JSON objects. Never stringify MCP arguments into escaped JSON strings.
- **PayBox authorization**: PayBox writes (`paybox_request_transfer`) use their own live signing and approval UI. Never call `prepare_destructive_action` for PayBox tools.
- **No invented tools**: Use only canonical tools that exist on the hosted Mermail MCP server. There is no MCP tool to attach a custom label to an existing message, so mailbox state is managed via folders (`list_folders`, `create_folder`, `move_email`).
- **One call per approved action**: Never replay or auto-retry writes. Pending or uncertain status requires polling `paybox_get_request`, not submitting duplicate requests.
