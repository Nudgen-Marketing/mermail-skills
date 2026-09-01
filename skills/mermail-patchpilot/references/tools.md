# PatchPilot tool routing

PatchPilot is an orchestration/persona skill. It owns **no Mermail MCP tools** and must not be added under `domains` or `walletScopedDomains` in `tool-coverage.json`.

Use the host-exposed identifier exactly as provided (for example, `search_emails` or `Mermail:search_emails`). Pass `query` and `body` as native JSON objects, never stringified JSON.

| Need | Canonical owner | Allowed exact tools |
| --- | --- | --- |
| Correlate and safely read the selected incident mail | `mermail-manage-inbox` | `list_emails`, `search_emails`, `get_email`, `get_email_context`, `get_thread` |
| Resolve a mailbox when needed | `mermail-administer-workspace` | `list_mailboxes` |
| Preview and send an approved resolution reply | `mermail-compose-email` | `reply_to_email` or `send_email` |
| Optional x402 connection, payment, and reconciliation | `mermail-agent-wallet` | `get_paybox_connection`, `paybox_pay_x402`, `paybox_get_request` |
| Optional pay-then-continue intelligence workflow | `mermail-x402-agent` | Apply its current workflow; it owns no tools either |

`paybox_pay_x402` is available only on eligible full-profile OAuth, is a wallet-destructive effect, and must follow the Agent Wallet/x402-agent contract. Do not call it through API-key or `agent-inbox` profiles. Do not call `prepare_destructive_action` for PayBox tools.

Host-local coding capabilities are not Mermail MCP tools. They may inspect and edit only the authenticated user's selected local repository and authorized path scope, then run an independently authorized or repository-policy-defined deterministic verification command. Do not invent a Mermail tool for local remediation, shell execution, testing, deployment, or source-control actions.
