# Tools

This skill **owns no MCP tools**. It is a cross-domain persona registered under `infrastructureSkills` in `tool-coverage.json`. Every tool it touches is owned by another skill, and this file records the boundary rather than re-declaring ownership.

Follow the owning skill's argument, approval, and retry contracts exactly. Where this file and an owning skill disagree, the owning skill wins.

## Conventions

- Pass structured arguments as **native JSON objects**. Never stringify an object into a string field such as `query`.
- Use the exact tool identifier exposed by the current host (for example `list_emails` or a host-qualified form like `Mermail:list_emails`). Do not manually add, strip, or invent prefixes inconsistently.
- Prefer mailbox `public_id` as `mailboxId` when the list tools return it.
- Stamp every step of one acquisition with the same `procurement_id`. It is a skill-local correlation key, not an MCP argument — do not invent a tool field for it.

## Delegated legs

| Leg | Owning skill | Tools used | Risk |
| --- | --- | --- | --- |
| Workspace and mailbox resolution | `mermail-administer-workspace`, `mermail-agent-inbox` | `list_workspaces`, `list_mailboxes`, `create_mailbox` | read / write-preview |
| Verification and receipt discovery | `mermail-agent-inbox`, `mermail-manage-inbox` | `search_emails`, `list_emails`, `get_email`, `get_email_context` | read |
| Payment readiness and funding | `mermail-agent-wallet` | `get_paybox_connection`, `get_agent_wallet_portfolio`, `paybox_get_portfolio`, `paybox_get_buy_link` | read / handoff |
| The single charge | `mermail-agent-wallet`, `mermail-x402-agent` | `paybox_pay_x402`, `paybox_request_transfer`, `paybox_get_request` | destructive |
| Evidence filing | `mermail-manage-inbox` | `list_custom_labels`, `create_custom_label`, `list_folders` | read / write-preview |

## Boundary notes

- **Mailbox provisioning** costs 10 provision credits and `create_mailbox` requires `email` and `name`; `workspaceId` is optional. Read the live schema before calling. Call it at most once per procurement, and never loop through write retries on conflict.
- **PayBox readiness** is decided by one `tools/call` of `get_paybox_connection`, never by inspecting `tools/list`. Absence from a host list is not "not exposed". Reconnect Mermail MCP only after that call returns unknown-tool, method-not-found, or a hard fail.
- **PayBox requires full-profile OAuth.** `MERMAIL_API_KEY` never authorizes it, and `profile=agent-inbox` never exposes it. A procurement that needs a charge cannot run on the agent-inbox profile.
- **The charge tool is selected by the vendor's payment shape, not by preference.** An x402 challenge uses `paybox_pay_x402`; a direct on-chain payee uses `paybox_request_transfer`. Both are wallet-destructive and require the owning skill's approval contract. Do **not** call `prepare_destructive_action` for PayBox tools — it does not gate them.
- **Proof creation is not settlement.** A `success` status from the pay tool or `paybox_get_request` means the proof exists. Treat it as `paid_unreconciled` until receipt reconciliation or independent settlement evidence says otherwise.
- **Filing never deletes.** This skill uses label and folder reads plus classifier-definition creation. No tool in the inbox domain manually attaches a label to a message, so file by folder move or by a triager definition — do not claim a manual label assignment that the API does not expose.
- **Never invent a tool.** There is no `procurement`, `subscribe`, `checkout`, or `reconcile` tool on the hosted server. If a leg cannot be executed with the tools above plus an allowlisted host tool, stop and report the gap.

## Examples

Bounded receipt search, native JSON object:

```json
{
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Do not pass `"query": "{\"sortColumn\":\"date\"}"`.
