# Inbox-canary tool map

This skill composes tools owned by other skills; it owns none. Follow the
owning skills' argument, approval, and retry contracts.

## Catalog requirement

Run the canary on the full catalog, `https://console.mermail.app/mcp`. The
`?profile=agent-inbox` profile exposes exactly 12 read/provision tools and does
not include `send_email`, so a round-trip probe is impossible there. Both
authentication modes work — MCP OAuth (`mcp:tools`) is the preferred client
connection; `x-api-key` via `MERMAIL_API_KEY` is the headless fallback. Neither
is required specifically by this skill; the only requirement is that
`send_email` is in the live catalog. Do not silently reconfigure a shared
connection to add send capability.

The names below are bare MCP `tools/list` names. When a host exposes qualified
identifiers, invoke the exact identifier it discovered; never invent or
manually rewrite a host-qualified alias.

## Discovery (owned by `mermail-administer-workspace`)

- `list_workspaces` — resolve the credential-bound workspace once.
- `list_mailboxes` — preferred discovery call: `list_mailboxes({})`. Reuse the
  mailbox `public_id` as `mailboxId` and normalize the email to lowercase.
  Reject candidates with `disabled_at`, `can_receive: false`, or
  `receiving_status` other than `ready`.
- `get_mailbox` — verify one selected mailbox before probing.

## Probe send (owned by `mermail-compose-email`)

- `send_email` — external effect. One tagged self-probe per request:

  ```json
  {
    "mailboxId": "MAILBOX_PUBLIC_ID",
    "idempotencyKey": "mc-<yyyymmdd>-<token>",
    "body": {
      "from": "mailbox@mermail.app",
      "to": "mailbox@mermail.app",
      "subject": "mermail-canary <token>",
      "text": "probe payload with token and sent_at"
    }
  }
  ```

  Preview and approval required before the call. `400`
  `email_send_recipient_limit_exceeded`, `429`
  `email_send_rate_limit_exceeded`, and `503`
  `email_send_rate_limit_unavailable` are terminal for the probe — surface the
  status; do not auto-retry.

## Arrival reads (owned by `mermail-manage-inbox`)

- `search_emails` — bounded poll for the probe:

  ```json
  {
    "mailboxId": "TARGET_PUBLIC_ID",
    "query": {
      "subject": "<token>",
      "date_start": "<probe window start ISO>",
      "include_held": true,
      "metadata_only": true,
      "agent_safe_content": true,
      "page": 1,
      "limit": 10
    }
  }
  ```

  Pass `query` as a native JSON object; never stringify it. `include_held`
  keeps an automation-held probe visible as metadata.
- `list_emails` — newest-first fallback (`sortColumn: "date"`,
  `sortDirection: "DESC"`, `metadata_only`, `agent_safe_content`); there is no
  `sort: "date_desc"` shortcut. Also used for the read-only health mode.
- `get_email` — inspect the validating probe with `agent_safe_content: true`
  and a bounded `max_body_chars`; a scan mismatch returns metadata with
  `content_omitted: true`, which is itself a `degraded` signal, not a not-found.

## Deliberately unused

- `create_mailbox` — a canary verifies an existing mailbox; it never provisions
  one to mask a delivery problem.
- `update_email`, `move_email`, `delete_email`, bulk organization tools — the
  probe is left in place for the user to handle deliberately.
- `prepare_destructive_action` — this workflow has no destructive step.
- All `paybox_*` / Agent Wallet tools — wallet writes are out of scope and
  unrelated to a mail round trip.
