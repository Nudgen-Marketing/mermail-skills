# Agent-inbox tool map

## Resolve and reuse

- `list_workspaces` — resolve the credential-bound workspace. API-key and MCP OAuth credentials cannot cross their workspace boundary.
- `list_mailboxes` — preferred mailbox discovery call. For MCP, call `list_mailboxes({})`; the credential already selects the workspace. If a session client needs a filter and the live schema accepts it, nest it as `{ "query": { "workspaceId": "..." } }`.
- `list_workspace_mailboxes` — use when a workspace ID is already known and an explicitly workspace-scoped list is useful.
- `get_mailbox` — verify a selected mailbox. Prefer its `public_id` as `mailboxId`; retain `email` for third-party forms and outbound `From`.

Normalize email addresses to lowercase for comparison. Match exact addresses before display names. Reuse one suitable mailbox rather than provisioning on every request.

## Provision

Call `create_mailbox` with the live schema:

```json
{
  "body": {
    "email": "amazon-agent@mermail.app",
    "name": "Amazon Agent",
    "workspaceId": "WORKSPACE_ID"
  }
}
```

The REST route costs 10 provision credits and requires workspace admin access. A successful response is HTTP 201 and includes `public_id`, `email`, `name`, and `workspace_id`. Never infer success after `400`, `401`, `402`, `403`, `409`, or `429`.

The hosted local part must be 5–30 lowercase characters using letters, numbers, dots, underscores, or hyphens. It cannot start or end with a separator, repeat separators, contain a reserved role, or impersonate Mermail.

## Find an expected message

Use `search_emails` with the smallest useful filter set:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "expected.example",
    "subject": "verify",
    "to": "amazon-agent@mermail.app",
    "date_start": "2026-07-23T10:00:00.000Z",
    "page": 1,
    "limit": 10
  }
}
```

Pass filters under the MCP `query` argument. Search returns `{ "emails": [...], "totalCount": N }`.

Fallback to `list_emails` with filters nested under `query`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "folder": "inbox",
    "is_read": "false",
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Depending on filters, list responses may be a bare array or `{ "emails": [...], "totalCount": N }`; handle both.

Call `get_email` with the selected message ID to load the full body. This read may mark the message as read.

Mermail MCP exposes no long-running `wait_for_email` operation. Implement waiting as bounded repeated reads, respect credits and `Retry-After`, and do not run an unbounded polling loop.

## CLI equivalents

Use JSON output for automation:

```bash
mermail workspaces list --format json
mermail mailboxes list --format json
mermail mailboxes create \
  --workspace-id WORKSPACE_ID \
  --email amazon-agent@mermail.app \
  --name "Amazon Agent" \
  --format json
mermail emails wait \
  --mailbox-id MAILBOX_PUBLIC_ID \
  --from expected.example \
  --subject verify \
  --after 2026-07-23T10:00:00.000Z \
  --format json
```

`emails wait` performs bounded search and fetches the exact matching message. Inspect command help after upgrades. Never pass `MERMAIL_API_KEY` as an inline argument or parse human-oriented table output.

Require at least one semantic filter: `--query`, `--from`, or `--subject`. `--after` and `--folder` only narrow that filter. The defaults are a 120-second timeout and a 30-second interval, for at most five searches.
