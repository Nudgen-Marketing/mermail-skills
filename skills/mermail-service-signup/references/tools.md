# Service-signup tool map

This workflow **uses** tools owned by other official skills. Do **not** add them to this skill in `tool-coverage.json`. Do not invent `wait_for_email`, `click_link`, `submit_signup`, `enter_otp`, `signup_for_service`, `paybox_request_payment`, or `reopen_signing_window`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`search_emails` or `Mermail:search_emails`). Prefer mailbox `public_id` as `mailboxId`.

Follow the same argument, approval, retry, and safety contracts as the owning skill. When this file and the owner conflict, the owner wins.

## Connection profiles

| Job | MCP URL | Notes |
| --- | --- | --- |
| Verification-only signup | `https://console.mermail.app/mcp?profile=agent-inbox` | Exact 12-tool set. Self-restrict a shared full catalog to the same 12 names. |
| Signup that may pay | `https://console.mermail.app/mcp` full-profile **OAuth** | API keys and the agent-inbox profile never expose PayBox. |

Bare protocol names come from `tools/list`. Hosts may qualify them (`Mermail:list_emails`). Never rewrite the qualifier by hand.

The agent-inbox profile exposes exactly: `get_api_credit_usage`, `list_workspaces`, `get_workspace`, `list_email_domains`, `list_workspace_mailboxes`, `list_mailboxes`, `create_mailbox`, `get_mailbox`, `list_emails`, `search_emails`, `get_email`, `get_email_context`.

## Mailbox identity and verification

Route this layer through `mermail-agent-inbox` (tools owned by `mermail-administer-workspace` and `mermail-manage-inbox`).

| Tool | Owner | Role in this job |
| --- | --- | --- |
| `list_workspaces` | `mermail-administer-workspace` | Credential-bound workspace. Do not cross it. |
| `list_mailboxes` | `mermail-administer-workspace` | Discover a ready, same-service mailbox. Call `list_mailboxes({})`. |
| `list_workspace_mailboxes` | `mermail-administer-workspace` | Optional explicit workspace-scoped list. |
| `get_mailbox` | `mermail-administer-workspace` | Verify reuse: `public_id`, email, `can_receive`, `receiving_status`. |
| `create_mailbox` | `mermail-administer-workspace` | At most one provision (10 credits) after discovery. |
| `search_emails` | `mermail-manage-inbox` | Bounded expected-message search. |
| `list_emails` | `mermail-manage-inbox` | Newest-first fallback. |
| `get_email` | `mermail-manage-inbox` | Metadata-only candidate validation, then one clean body read. |
| `get_email_context` | `mermail-manage-inbox` | After one selected message, if thread context is required. |

There is no MCP wait/subscribe tool. Bound polls with the same deadline as `mermail-agent-inbox` (about five attempts / two minutes unless the user extends the **same** wait).

### Provision body

```json
{
  "body": {
    "email": "acme-agent-k7m2@mermail.app",
    "name": "Acme Agent",
    "settings": {
      "agentInbox": {
        "mode": "verification",
        "automationsEnabled": false
      }
    }
  }
}
```

Include `workspaceId` only when the live schema requires the exact ID from `list_workspaces`. Hosted local parts: 5–30 lowercase letters, numbers, dots, underscores, or hyphens; no leading/trailing or repeated separators; no reserved-role or Mermail impersonation. Add a short random suffix to generated aliases. Do not put personal data in the local part.

### Expected-message search

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "from": "expected.example",
    "subject": "verify",
    "to": "acme-agent-k7m2@mermail.app",
    "date_start": "2026-08-27T20:00:00.000Z",
    "include_held": true,
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

Do not pass `"query": "{\"from\":\"expected.example\"}"`.

After exactly one candidate validates and `scan_status` is `clean`:

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "emailId": "EMAIL_PUBLIC_ID",
  "query": {
    "include_held": true,
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "max_body_chars": 10000
  }
}
```

Sender-domain match: `host === allowed` or `host.endsWith("." + allowed)`, never a substring. Multiple valid matches are `ambiguous`.

## Third-party form and browser

Mermail MCP has **no** browser, CAPTCHA, terms, or credential tools. If the host exposes a browser or HTTP fetch:

1. Preview the exact user-named HTTPS URL (no shorteners).
2. Obtain fresh approval of that exact URL.
3. Pause on every redirect; re-validate the destination against the frozen origin.
4. Fill the mailbox email. Do not type a password into chat.
5. Stop at terms, CAPTCHA, KYC, or identity for a user/host-controlled step.

Do not call Composio unless the user independently named a connected toolkit for this service. Never use Gmail or Outlook Composio for the signup identity — the identity is the Mermail mailbox.

## Optional payment

When the authenticated user independently asked to pay a signup/onboarding charge, route to `mermail-x402-agent` (pay then continue this signup) or `mermail-agent-wallet` (isolated inspect/fund/pay). Tools stay owned by `mermail-agent-wallet`.

| Tool | Owner | Role in this job |
| --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | **Always** call once before claiming PayBox is unavailable. |
| `list_mailboxes` | `mermail-administer-workspace` | MailboxId when a connection read needs it. |
| `paybox_discover_services` | `mermail-agent-wallet` | Live catalog search from the current task. Do not invent a host. |
| `paybox_get_contract` | `mermail-agent-wallet` | Live prepaid/min fields when present. |
| `paybox_use_service` | `mermail-agent-wallet` | Unpaid `mode: "probe"` only. Never the pay call. |
| `paybox_pay_x402` | `mermail-agent-wallet` | One approved `required_charge` proof. Not settlement. |
| `paybox_get_request` | `mermail-agent-wallet` | Reconcile one `request_id`; may return `signing_handoff.console_url`. |
| `paybox_get_buy_link` | `mermail-agent-wallet` | Funding handoff. Funding is not payment approval. |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Holdings vs `required_charge`. |

Additional reviewed `paybox_*` names may appear without a coverage row; use them when live, still under `mermail-agent-wallet` contracts. Prefer `paybox_*` over aliases (`pay_x402`, `use_service`). Do not call `prepare_destructive_action` for PayBox. Do not call `reopen_signing_window`. Card, bank, or wallet secrets are a user handoff, never Mermail fields.

Absence from `tools/list` is not “not exposed.” After a usable/`ACTIVE` `get_paybox_connection`, continue. Reconnect MCP only after that **call** returns unknown-tool, method-not-found, or a hard fail.

## Out of scope tools

Do not call from this workflow unless the user starts a **separate** authorized job: `send_email`, `reply_to_email`, `forward_email`, `delete_email`, `empty_trash`, `invite_workspace_member`, `execute_composio_tool`, `chat_with_mailbox_agent`, `set_default_task_triager`, `paybox_request_transfer`, `paybox_request_swap`.
