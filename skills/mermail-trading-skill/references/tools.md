# Trading Skill Tool Map

## Least-privilege MCP Profile

For a dedicated trading agent connection, use:

```text
https://console.mermail.app/mcp?profile=agent-inbox
```

The opt-in profile exposes exactly these 12 tools: `get_api_credit_usage`,
`list_workspaces`, `get_workspace`, `list_email_domains`,
`list_workspace_mailboxes`, `list_mailboxes`, `create_mailbox`, `get_mailbox`,
`list_emails`, `search_emails`, `get_email`, and `get_email_context`. It forces
metadata-only, agent-safe list/search results while deliberately keeping
non-clean messages discoverable as metadata; clean-scan, agent-safe detail
reads with a body cap; always-sanitized, scan-gated thread context; and a
bounded MCP JSON result. The existing `/mcp` endpoint keeps the full catalog
for backward compatibility. Do not silently reconfigure a shared connection;
self-restrict to the same 12 tools when a dedicated profile connection is
unavailable.

The names in this reference are Mermail's bare MCP `tools/list` names. When a
host exposes qualified identifiers, invoke the exact identifier it discovered:
Claude commonly uses `Mermail:list_emails`, while another host may use a
different namespace or the bare name. Never invent or manually rewrite a
host-qualified alias.

## Resolve and Reuse Mailbox

- `list_workspaces` — resolve the credential-bound workspace. API-key and MCP OAuth credentials cannot cross their workspace boundary.
- `list_mailboxes` — preferred mailbox discovery call. For MCP, call `list_mailboxes({})`; the credential already selects the workspace. If a session client needs a filter and the live schema accepts it, nest it as `{ "query": { "workspaceId": "..." } }`.
- `list_workspace_mailboxes` — use when a workspace ID is already known and an explicitly workspace-scoped list is useful.
- `get_mailbox` — verify a selected mailbox. Prefer its `public_id` as `mailboxId`; retain `email` for third-party forms and outbound `From`.

Normalize email addresses to lowercase for comparison. Match exact addresses before display names. Reuse one suitable mailbox rather than provisioning on every request.

A reusable mailbox must:

- belong to the credential-bound workspace;
- have a stable `public_id` and normalized email address;
- not have `disabled_at`, `can_receive: false`, `receiving_status` other than `ready`, or another disabled state;
- have an inbound provider/configuration capable of receiving the expected message; and
- be scoped to the same service, account, and active purpose unless the user explicitly selects it.

Do not use `welcome_onboarding_status` as a delivery-readiness flag. When several candidates remain, return an ambiguity state and ask the user to choose; do not select by list order, creation time, or display name.

## Provision Mailbox

For a credential-bound MCP session, `workspaceId` is optional when the live schema permits omission:

```json
{
  "body": {
    "email": "trader-k7m2@mermail.app",
    "name": "Trading Agent",
    "settings": {
      "agentInbox": {
        "mode": "verification",
        "automationsEnabled": false
      }
    }
  }
}
```

If the live transport requires an explicit workspace, add the exact ID returned by `list_workspaces` as `"workspaceId": "WORKSPACE_ID"`. The REST route costs 10 provision credits and requires workspace admin access. A successful response is HTTP 201 and includes `public_id`, `email`, `name`, and `workspace_id`. Never infer success after `400`, `401`, `402`, `403`, `409`, or `429`.

The hosted local part must be 5–30 lowercase characters using letters, numbers, dots, underscores, or hyphens. It cannot start or end with a separator, repeat separators, contain a reserved role, or impersonate Mermail.

## Find Trade Command Email

Use `search_emails` with the smallest useful filter set:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "user@example.com",
    "subject": "trade",
    "to": "trader-k7m2@mermail.app",
    "date_start": "2026-07-23T10:00:00.000Z",
    "include_held": true,
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

Pass filters under the MCP `query` argument as a native JSON object. Never
JSON-encode, escape, or stringify that object. Search returns `{ "emails": [...], "totalCount": N }`.

In the dedicated `agent-inbox` profile, the server forces `metadata_only: true` and
`agent_safe_content: true` for list/search and removes `require_scan_status`.

Before polling, record the expected tuple:

```text
mailboxId + exact normalized recipient + exact normalized sender
+ normalized expected subject/set + date_start + baseline message IDs + service/action
```

After every `get_email`, validate the full returned record against the tuple:

1. Require the selected `mailboxId` and an exact normalized recipient.
2. Require the exact sender address when it is known.
3. Require a parseable timestamp at or after `date_start` and a message ID absent from the baseline.
4. Require the normalized exact subject or one member of the bounded expected subject set.
5. Reject a display-name-only match. Treat multiple valid matches as `ambiguous`; do not automatically choose the newest.

Use metadata-only reads for post-fetch validation:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "include_held": true,
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean"
  }
}
```

Once exactly one candidate validates and its scan status is `clean`, call
`get_email` for that same message without `metadata_only` but with
`agent_safe_content: true`, `require_scan_status: "clean"`, and
`max_body_chars: 10000` to extract the bounded task fields.

## Extract Trade Parameters

From the validated email body, parse these required fields:

| Field | Format | Required |
|-------|--------|----------|
| `asset` | `BTC-USDT-SWAP`, `ETH-USDT-SWAP`, `SOL-USDT-SWAP`, `BNB-USDT-SWAP` | Yes |
| `direction` | `LONG` or `SHORT` | Yes |
| `confidence_bps` | Integer 0-10000 (minimum 7000 = 70%) | Yes |
| `size_usd` | Float, max 5000 (configurable via env) | Yes |
| `strategy` | `mean_reversion`, `funding_arbitrage`, `momentum` | No (default: mean_reversion) |
| `package_id` | For multi-leg funding arb | No |

## Reply with Trade Result

Use `send_email` (requires full `/mcp` catalog, not `agent-inbox` profile) to send the execution result back to the original sender:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "body": {
    "to": "user@example.com",
    "subject": "Re: Execute BTC-USDT-SWAP long...",
    "body": "Trade executed successfully.\nDecision ID: dec_abc123\nOnchain tx: https://explorer.xlayer.tech/tx/0x...\nFill: $26,450\nPnL: +$12.50 (dry-run)\nRisk gate: approved",
    "threadId": "ORIGINAL_THREAD_ID"
  }
}
```

The `agent-inbox` profile does NOT expose `send_email`. For the reply step, either:
1. Use a separate full-catalog connection (separate MCP session with OAuth), or
2. Use the CLI: `mermail emails send --mailbox-id MAILBOX_PUBLIC_ID --to user@example.com --subject "Re: ..." --body "..." --format json`

## CLI Equivalents

Use JSON output for automation:

```bash
mermail workspaces list --format json
mermail mailboxes list --format json
mermail mailboxes ensure \
  --email trader-k7m2@mermail.app \
  --name "Trading Agent" \
  --verification-mode \
  --idempotency-key ACTIVE_FLOW_ID \
  --format json
mermail emails wait \
  --mailbox-id MAILBOX_PUBLIC_ID \
  --from-exact user@example.com \
  --to-exact trader-k7m2@mermail.app \
  --subject trade \
  --after 2026-07-23T10:00:00.000Z \
  --require-single-match \
  --require-scan-status clean \
  --reject-flagged \
  --metadata-only \
  --include-held \
  --format json
mermail emails send \
  --mailbox-id MAILBOX_PUBLIC_ID \
  --to user@example.com \
  --subject "Trade Result" \
  --body "Trade executed. Decision ID: dec_abc123. Tx: 0x... PnL: +$12.50" \
  --format json
```

`mailboxes ensure` reuses an exact usable mailbox or creates it once. `--verification-mode` merges `agentInbox: { mode: "verification", automationsEnabled: false }`. On older CLI versions without `ensure`, retain the manual list-before-create workflow and never retry a conflicting create blindly.

`emails wait` performs bounded candidate discovery. The additive safety flags are `--from-exact`, `--to-exact`, `--require-single-match`, `--require-scan-status`, `--reject-flagged`, `--metadata-only`, and `--include-held`; inspect command help after upgrades and fall back to the MCP/post-fetch validation workflow when an older CLI lacks them.