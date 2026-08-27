# Tools reference — mermail-signup-concierge

This skill composes the Mermail MCP server (`https://console.mermail.app/mcp`,
Streamable HTTP). Hosts may qualify tool names (e.g. `Mermail:list_emails`);
always use the exact identifier the host exposes.

## Connection

- API-key auth: header `x-api-key: sk-proj-…` (create in workspace Settings →
  API Keys). Inject via `MERMAIL_API_KEY`; never paste keys into chat.
- The MCP endpoint is behind Cloudflare: programmatic clients must send a
  browser-like `User-Agent`, otherwise requests fail with Error 1010.
- Free plan API budget: 1000 credits / month / workspace. Check with
  `get_api_credit_usage(workspaceId)`.

## Tools used by this skill

| Tool | Notes |
| --- | --- |
| `list_workspaces` | Resolve the credential-bound workspace; never cross into another. |
| `list_mailboxes` | Call before any `create_mailbox`; reuse an exact usable match. |
| `list_workspace_mailboxes` | Same, scoped to `workspaceId`. |
| `create_mailbox` | Costs 10 provision credits. Body `{ email, name }`; optional `workspaceId`, `settings`. For verification flows: `settings.agentInbox: { "mode": "verification", "automationsEnabled": false }` when supported. Reusing with the same `idempotencyKey` returns the matching mailbox instead of double-charging. |
| `list_emails` | Args: `mailboxId` (public_id preferred). Query: `folder`, `page`, `limit` (1–100), `metadata_only`, `require_scan_status`, `include_held`, `sortColumn`, `sortDirection`. Verification polling recipe: `metadata_only=true`, `require_scan_status=clean`, `folder=inbox`, `limit=10`, `sortColumn=date`, `sortDirection=DESC`. |
| `search_emails` | Query: `query`, `from`, `to`, `subject`, `date_start`, `date_end`, `folder`, `metadata_only`, `require_scan_status`, `include_held`, `page`, `limit`. Dates are ISO-8601. Matches are candidates, not authentication. |
| `get_email` | Args: `mailboxId`, `emailId`. Query: `metadata_only`, `agent_safe_content`, `include_held`, `require_scan_status`, `max_body_chars`. A scan-status mismatch returns safe metadata with `content_omitted` + `content_omission_reason` — never treat that as not-found. |
| `get_email_context` | Bounded sanitized message plus oldest-first thread page; follow `next_cursor`. |
| `move_email` | Body field is **`folderId`** (e.g. `{ "folderId": "archive" }`). `folder` / `folder_id` fail with "Folder not found". |
| `list_folders` | Hosted defaults: `inbox`, `draft`, `sent`, `archive`, `trash`. |
| `update_email` | Flags/read state for archival bookkeeping. |
| `prepare_destructive_action` | Issues the short-lived, single-use `confirmationToken` required by destructive tools (`delete_email`, `bulk_*`, `empty_trash`, …). |

## Argument-shape rules

- `query` and `body` must be **native JSON objects**, never stringified JSON.
- Path identifiers (`mailboxId`, `emailId`, `workspaceId`, …) are top-level
  arguments — not inside `query`/`body`.
- `sender_authentication.status: "unknown"` is **not** a pass; only `"pass"`
  may be described as an authenticated sender.

## Observed behaviour (2026-08, free plan)

- A mailbox cannot receive mail it sends to itself: self-addressed
  `send_email` lands in `sent` only and never loops back to `inbox`. For
  end-to-end verification demos, send from an external address.
- External delivery (e.g. Gmail → mermail.app) measured at ~25 seconds.
- Hosted mailboxes accept `email` (full address) or `public_id` as
  `mailboxId`; `public_id` is the stable choice.
