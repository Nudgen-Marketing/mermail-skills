# Tools reference — mermail-app-dispatch

This skill owns no MCP tools. Every operation below belongs to another official skill and is
composed here. Ownership stays where `tool-coverage.json` puts it.

## Host identifiers

Use the exact tool identifier exposed by the current host. Some hosts qualify names
(`Mermail:execute_composio_tool`), others do not (`execute_composio_tool`). Do not manually add,
strip, or invent qualification — read what `tools/list` returned and use that string.

## Argument shape

Every `query` argument is a **native JSON object**. Never stringify it.

```json
{ "query": { "search": "create issue", "toolkit": "github" } }
```

```text
wrong: { "query": "{\"search\": \"create issue\"}" }
```

The same rule applies to `body` and `body.arguments` on `execute_composio_tool`. A stringified
blob is rejected by the server and must never be produced as a workaround.

## Discovery and execution (owned by `mermail-composio`)

| Intent | Tool | Notes |
| --- | --- | --- |
| See which toolkits are connected | `list_composio_connections` | Call before any dispatch. Returns `configured` and a `connections` array; an empty array means nothing is connected yet. |
| Browse the catalogue | `list_composio_toolkits` | Returns `slug`, `toolsCount`, `triggersCount`, `authSchemes`, `isConnected`. |
| Find a capability | `search_composio_tools` | `query.search` should be three characters or more. Optional `query.toolkit` narrows to one slug. Returns `slug`, `risk`, `allowed`, `connected`. |
| Read one tool's contract | `get_composio_tool_schema` | Takes `slug`. Returns the input schema plus policy metadata. Check `connected` and `allowed` here before executing. |
| Run it | `execute_composio_tool` | `body.slug` required; `body.arguments` an object; `body.connectedAccountId` optional. Pass `idempotencyKey`. |

Connection management — `connect_composio_toolkit`, `disconnect_composio_toolkit`,
`sync_composio_connections` — is deliberately **not** used by this skill. It belongs to
`mermail-composio` and must be a direct user act, never a consequence of inbound mail.

## Mailbox operations (owned by inbox and compose skills)

| Intent | Tool | Owner |
| --- | --- | --- |
| Resolve the mailbox | `list_mailboxes` | `mermail-manage-inbox` — use `public_id` as `mailboxId` |
| Read the trigger message | `get_email` | `mermail-manage-inbox` — require `scan_status: clean` before reading a body |
| Locate the request | `search_emails` | `mermail-manage-inbox` — bounded `limit`, narrow date window |
| Write the report | `save_draft` | `mermail-compose-email` — draft first, always |
| Send the report | `reply_to_email` | `mermail-compose-email` — one external write per approved preview |
| Gate a destructive write | `prepare_destructive_action` | infrastructure — short-lived token bound to the exact tool and arguments |

## Policy metadata

`search_composio_tools` and `get_composio_tool_schema` return the host's own judgement about each
tool. Quote these values; do not restate them as your own opinion.

- `connected` — false means the toolkit has no account attached. `execute_composio_tool` returns
  **409**. Route to `mermail-composio`; do not substitute a different toolkit.
- `allowed` — false means policy forbids this tool. `execute_composio_tool` returns **403**. Stop.
  Do not search for a near-neighbour tool that achieves the same effect.
- `risk` — the host's risk classification. Anything the host marks destructive requires
  `prepare_destructive_action` and an exact user confirmation string, not just preview approval.

## Errors

| Code | Meaning | Correct response |
| --- | --- | --- |
| 403 | Tool disallowed by policy | Report the slug and stop. Never route around it. |
| 409 | Toolkit not connected | Report which toolkit, route connection to `mermail-composio`. |
| 4xx on arguments | Schema mismatch | Re-read `get_composio_tool_schema`; never guess a field name. |

Retry only a transport failure, and only with the original `idempotencyKey`. Never retry a 403 or a
409 — both are decisions, not transient faults.

## Credits and plan

`execute_composio_tool` and the search endpoints consume API credits on the workspace's plan. Check
`get_api_credit_usage` when a run is unexpectedly refused. Composio itself must be `configured` on
the workspace; `list_composio_connections` reports `configured: false` when it is not.
