# Mermail PACT tool map

PACT owns no MCP tools. It composes canonical owners and preserves every owner’s argument, approval, retry, and result contract.

Pass `query` and `body` as **native JSON objects**. Never stringify them. Use the exact tool identifier exposed by the host, such as `search_emails` or `Mermail:search_emails`; do not invent provider-action tool names or host prefixes.

## Mailbox and submissions

| Tool | Owner | PACT use | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Resolve one ready mailbox and stable `public_id` | read |
| `search_emails` | `mermail-manage-inbox` | Bounded metadata-first candidate search | read |
| `get_email` | `mermail-manage-inbox` | Read one exact clean candidate | read |
| `get_email_context` / `get_thread` | `mermail-manage-inbox` | Bounded context after selecting one message | read |
| `save_draft` | `mermail-compose-email` | Optional invitation, clarification, outcome, or receipt draft | internal write |
| `send_email` / `reply_to_email` | `mermail-compose-email` | Approved invitation, clarification, outcome, or receipt | external effect |

Prefer metadata-first correlation:

```json
{
  "mailboxId": "mailbox-public-id",
  "query": {
    "subject": "[PACT:PACT-2026-001]",
    "date_start": "2026-09-01T00:00:00Z",
    "date_end": "2026-09-10T18:00:00Z",
    "metadata_only": true,
    "require_scan_status": "clean",
    "agent_safe_content": true,
    "limit": 20,
    "sortColumn": "date",
    "sortDirection": "ASC"
  }
}
```

Search fields find candidates only. Re-check exact normalized sender, recipient, `pact_id`, arrival window, scan status, and ambiguity after fetching the selected Mermail id.

Send-like payloads use an exact `from`, recipient roles, subject, and `text` or `html`. One approval covers only the displayed payload and one logical delivery. Use an idempotency key for that exact approved send; never retry an uncertain send with a new key.

## Verifier through Mermail Composio

| Tool | Owner | PACT use | Risk |
| --- | --- | --- | --- |
| `list_composio_toolkits` | `mermail-composio` | Discover the user-selected verifier toolkit | read |
| `list_composio_connections` | `mermail-composio` | Require the exact connection to be `ACTIVE` | read |
| `connect_composio_toolkit` / `sync_composio_connections` | `mermail-composio` | Optional user-completed connection handoff | external effect / read |
| `search_composio_tools` | `mermail-composio` | Discover the smallest exact provider action | read |
| `get_composio_tool_schema` | `mermail-composio` | Read live input schema, toolkit, risk, `connected`, and `allowed` | read |
| `execute_composio_tool` | `mermail-composio` | Run one bounded verifier read or separately approved provider write | external effect |

Do not invent direct GitHub names on the Mermail MCP surface. Search for capabilities such as pull-request details, changed files, check runs, or merge; select the exact returned slug; fetch its live schema; require `connected: true` and `allowed: true`; then call:

```json
{
  "body": {
    "slug": "EXACT_RETURNED_ACTION_SLUG",
    "arguments": {
      "schema_field": "user-selected-or-read-resolved-value"
    }
  }
}
```

Use `connectedAccountId` only when the exact returned account was deliberately selected. Never expose or invent it. `execute_composio_tool` is classified as an external effect in this repository even for a provider read, so scenarios and previews must retain that classification.

## Agent Wallet settlement

These tools require full-profile Mermail MCP OAuth. API keys and the `agent-inbox` profile never unlock them.

| Tool | Owner | PACT use | Risk |
| --- | --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Mandatory first PayBox action | read |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Resolve credential, token, chain, holdings, and live asset data | read |
| `paybox_request_transfer` | `mermail-agent-wallet` | One exact approved reward transfer | wallet destructive / PayBox signing |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one known provider `request_id` | read |

Read the exact live schema after the connection probe. Use the portfolio’s credential and token values, the user-selected chain, the human amount in `amount_decimal` when the schema requires it, and the exact user-bound destination. Never calculate base units, guess token addresses, fall back to a legacy proposal, or substitute an x402 payment.

Do **not** call `prepare_destructive_action` for `paybox_*`. PayBox owns policy, standing grants, approval, and signing. Call the transfer once. Pending approval/signature, timeout, malformed result, and `SUBMISSION_UNKNOWN` are not success. Reconcile once with `paybox_get_request` only after the user asks for status, confirms signing, or resumes the known PACT.

