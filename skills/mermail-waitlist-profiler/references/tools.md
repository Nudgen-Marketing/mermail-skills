# Waitlist profiler tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`. Pass arguments as native JSON objects; prefer mailbox `public_id` as `mailboxId`. PayBox tools appear only on full-profile MCP OAuth; call `get_paybox_connection` once before deciding PayBox is unavailable.

## Mail (owners: `mermail-manage-inbox`, `mermail-compose-email`, `mermail-administer-workspace`)

| Tool | Role |
| --- | --- |
| `list_mailboxes` | Resolve the waitlist, invite, and owner mailboxes |
| `list_emails` / `search_emails` | Find new applications |
| `get_email` | Read one application; `sender_authentication.status`, CC list, `scan_status` |
| `get_email_context` / `get_thread` | Read interview replies in the applicant's thread |
| `reply_to_email` | Interview, invite, and position replies in-thread after preview and approval (external effect) |
| `send_email` | Owner digest to the owner's own address after preview |
| `save_draft` | Keep any reply not yet approved |

## PayBox / Agent Wallet (owner: `mermail-agent-wallet`)

| Tool | Role |
| --- | --- |
| `get_paybox_connection` | Single readiness gate |
| `paybox_discover_services` | Find person and company enrichment services (read-only) |
| `paybox_use_service` | `mode: "probe"` only, for live quotes |
| `paybox_get_contract` | Prepaid floors for a `contract_uri` |
| `paybox_get_portfolio` | Confirm balance covers the run cap |
| `paybox_pay_x402` | One proof per enrichment call within caps |
| `paybox_get_request` | Reconcile `request_id` receipts |

## Composio (owner: `mermail-composio`)

| Tool | Role |
| --- | --- |
| `list_composio_connections` | Require Google Sheets `ACTIVE` |
| `search_composio_tools` / `get_composio_tool_schema` | Find the exact Sheets read/append/update slug |
| `execute_composio_tool` | Upsert `Applicants` rows, append `Runs` rows (external effect, previewed) |

## Example arguments

```json
{ "mode": "probe", "service_id": "svc_person_enrich", "input": { "email": "priya@payflow.io" } }
```

```json
{ "body": { "slug": "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", "arguments": { "spreadsheet_id": "<id>", "range": "Applicants!A1", "values": [["priya@payflow.io", "payflow.io", "pass", "9", "Series A fintech, 60 staff, eng lead", "raj@payflow.io", "-", "86", "invite", "verified work domain; ICP fit; concrete use case", "0.10 USDC", "req_abc", "invited"]] } } }
```

Field names and slugs are illustrative; read live schemas from `tools/list` and `get_composio_tool_schema`.
