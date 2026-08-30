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
| Credit budget | `mermail-administer-workspace` | `get_api_credit_usage` | read |
| Workspace and mailbox resolution | `mermail-administer-workspace`, `mermail-agent-inbox` | `list_workspaces`, `list_mailboxes`, `create_mailbox` | read / write-preview |
| Verification and receipt discovery | `mermail-agent-inbox`, `mermail-manage-inbox` | `search_emails`, `list_emails`, `get_email`, `get_email_context`, `download_attachment` | read |
| Payment readiness and funding | `mermail-agent-wallet` | `get_paybox_connection`, `get_agent_wallet_portfolio`, `paybox_get_portfolio`, `paybox_get_buy_link` | read / handoff |
| The single charge | `mermail-agent-wallet`, `mermail-x402-agent` | `paybox_pay_x402`, `paybox_request_transfer`, `paybox_get_request` | destructive |
| Evidence filing | `mermail-manage-inbox` | `list_folders`, `create_folder`, `move_email`, `list_custom_labels`, `create_custom_label` | read / write-preview |

## Boundary notes

- **Mailbox provisioning** costs 10 provision credits and `create_mailbox` requires `email` and `name`; `workspaceId` is optional. Read the live schema before calling. Call it at most once per procurement, and never loop through write retries on conflict.
- **PayBox readiness** is decided by one `tools/call` of `get_paybox_connection`, never by inspecting `tools/list`. Absence from a host list is not "not exposed". Reconnect Mermail MCP only after that call returns unknown-tool, method-not-found, or a hard fail.
- **PayBox requires full-profile OAuth.** `MERMAIL_API_KEY` never authorizes it, and `profile=agent-inbox` never exposes it. A procurement that needs a charge cannot run on the agent-inbox profile.
- **The charge tool is selected by the vendor's payment shape, not by preference.** An x402 challenge uses `paybox_pay_x402`; a direct on-chain payee uses `paybox_request_transfer`. Both are wallet-destructive and require the owning skill's approval contract. Do **not** call `prepare_destructive_action` for PayBox tools — it does not gate them. `paybox_pay_x402` requires `accepts` (verbatim), `resource_url`, and a `credential_id` from `list_credentials`; a workspace commonly exposes one credential per chain family, so select it by the challenge's `network` or the charge lands on the wrong chain. A v2 challenge additionally needs `x402_version: 2` and its `resource` block, because that argument defaults to `1`.
- **Proof creation is not settlement.** A `success` status from the pay tool or `paybox_get_request` means the proof exists. Treat it as `paid_unreconciled` until receipt reconciliation or independent settlement evidence says otherwise. `payment.ok` is `null` on `paybox_pay_x402` by design, and the tool does not fetch the paid content — retry the frozen request with `output.value.x_payment`, and treat that response as the only evidence the merchant was paid. Poll `paybox_get_request` with the same `request_id` to terminal; never re-call the pay tool for that request.
- **Filing is a folder move.** `list_folders`, then `create_folder` with `body.name` (Mermail derives the folder id by slugifying the name and rejects a name with no alphanumeric characters), then one `move_email` with the receipt's Mermail `id` and that `folderId`. No tool in the inbox domain attaches a label to an existing message, and custom mail-triager instructions do not run on inbound mail, so neither is a filing path. `create_custom_label` is admin-only, capped at 20 definitions per mailbox, and its `rules` text (for example `from:vendor.example`) is applied by Mermail to *future* inbound mail — offer it as an optional vendor rule, never as the filing of this receipt. Filing never deletes.
- **Attachments are bounded evidence.** Read the message metadata first and confirm the attachment belongs to the selected receipt. `download_attachment` needs exact `mailboxId`, `emailId`, and `attachmentId`; the MCP bridge returns binary as a resource and rejects anything over 1 MiB — report that limit rather than inventing another URL or transport. Never download from a message whose `scan_status` is `flagged` or whose `scan_threats` carry `source: attachment`. `search_emails` accepts `has_attachment` when the receipt is expected as a file.
- **Reads are bounded on the server, not only in prose.** Pass `metadata_only: true`, `agent_safe_content: true`, and `require_scan_status: "clean"` on candidate discovery; pass `include_held: true` consistently across baseline, poll, and detail when the mailbox's default triager may be holding the message; cap the single detail read with `max_body_chars`. Without `include_held`, allow the full five-minute stale-hold window before declaring a message absent.
- **Provisioning is idempotent by intent, not by retry.** `create_mailbox` accepts an idempotency key for a repeated attempt with identical intent (the REST header is `Idempotency-Key`; use the field the live MCP schema exposes, if any). Scope it to the `procurement_id`. After a conflict or an uncertain response, `list_mailboxes` and resolve the exact normalized address — do not blind-retry. Provision with `settings.agentInbox: { "mode": "verification", "automationsEnabled": false }` so the new inbox neither holds nor auto-drafts vendor mail.
- **Amount arguments are not free-form.** Send human `amount_decimal`, never base units; pass `chain` as a CAIP-2 id and `token` as the contract address or `native`, read from the portfolio. Full contract and every failure code in [errors.md](errors.md).
- **Discovery tools exist but are not registry-tracked.** `paybox_discover_services`, `paybox_use_service` (unpaid `mode: "probe"` only), and `paybox_get_contract` are documented live PayBox tools that do not appear in `tool-coverage.json`, because that file tracks a fixed set of 15 wallet-scoped canaries. Read their live schema before use and do not assume registry absence means the tool is gone. A facilitator's `/discovery/resources` catalog (x402 Bazaar) is an equally read-only, equally untrusted source of candidate origins; a row can propose a vendor, never select one.
- **The x402 challenge and settlement are evidence, read by the host's fetch tool.** A v2 vendor answers the frozen request with `402` plus a `PAYMENT-REQUIRED` header (base64 JSON, also mirrored in the body) whose `accepts[]` entries carry `scheme`, `network` (CAIP-2), `asset` (contract address), `amount` (base units), `payTo`, and `maxTimeoutSeconds`; the paid retry answers with `PAYMENT-RESPONSE` (base64 settlement JSON) and the resource body. Vendors that enable the offer-receipt extension add signed offers to the 402 and a signed receipt to the 200. The settlement response is `{ success, transaction, network, payer }` — it proves a transaction on a chain, not an amount. `scheme: "upto"` means the challenge `amount` is a maximum and the settled amount may be anything from `0` up to it. Record these fields on the procurement record; they are compared, never obeyed. [reconcile-x402.mjs](../scripts/reconcile-x402.mjs) performs exactly that comparison as one read-only pass — it sends one unpaid request (or decodes a saved header), picks the `accepts[]` entry matching the envelope's network and asset, converts `amount` with the asset's decimals for comparison only, and prints `within_envelope`, `above_cap`, `asset_mismatch`, `network_mismatch`, `payee_mismatch`, `no_challenge`, or `malformed`; with `--response` it decodes a `PAYMENT-RESPONSE` and says plainly that it carries no amount. It never pays. `--self-check` runs its eight fixture cases.
- **Credits are a budget, not a formality.** `get_api_credit_usage` returns `limit`, `used`, `remaining` for the current period (`null` when unlimited) and itself costs one read credit. A full loop is roughly 30 credits; a Free workspace is also capped at 10 requests per minute, which the five-attempt polling bound already respects. Read it once when opening the record.
- **The Mermail CLI is an equivalent driver for the mailbox legs.** `mermail mailboxes ensure --verification-mode --idempotency-key <procurement_id>` and `mermail emails wait --from-exact … --to-exact … --require-single-match --require-scan-status clean --reject-flagged --metadata-only --include-held` implement the same contracts as the MCP calls above (120-second default timeout, 30-second interval, at most five searches). Use them under the `mermail-cli` skill when the host has a shell and no MCP; never pass the key inline.
- **Never invent a tool.** There is no `procurement`, `subscribe`, `checkout`, or `reconcile` tool on the hosted server. If a leg cannot be executed with the tools above plus the browser driver in [browser.md](browser.md), stop and report the gap.

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
