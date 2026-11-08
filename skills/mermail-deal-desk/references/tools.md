# Deal desk tool map

This skill owns no MCP tools. Every call below belongs to another official skill, and that skill's argument, approval, and retry contract still applies. Read live schemas from MCP `tools/list`; do not invent or rewrite a host-qualified alias (Claude commonly exposes `Mermail:list_emails`).

| Step | Tool | Owner | Risk |
| --- | --- | --- | --- |
| Resolve the sending mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` | read |
| Find and read the thread | `search_emails`, `get_email`, `get_email_context` | `mermail-manage-inbox` | read |
| Send the offer | `send_email` | `mermail-compose-email` | external effect |
| Hold an unapproved draft | `save_draft` | `mermail-compose-email` | internal write |
| Reply on the thread | `reply_to_email` | `mermail-compose-email` | external effect |
| Check PayBox before paying | `get_paybox_connection` | `mermail-agent-wallet` | read |
| Read holdings before release | `paybox_get_portfolio` | `mermail-agent-wallet` | read |
| Release the payment | `paybox_request_transfer` | `mermail-agent-wallet` | wallet destructive |
| Reconcile the transfer | `paybox_get_request` | `mermail-agent-wallet` | read |

## Mailbox

`list_mailboxes({})` on an MCP session - the credential already selects the workspace. Prefer `public_id` as `mailboxId`; keep `email` for `body.from` and for display. A usable mailbox is not disabled, has `can_receive: true` and `receiving_status: ready` when those fields are present, and belongs to the credential-bound workspace.

## Finding the thread

Pass `query` as a **native JSON object**. Never stringify it.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "query": {
    "subject": "DEAL-7F3A2C",
    "from": "dev@example.com",
    "date_start": "2026-09-01T00:00:00.000Z",
    "metadata_only": true,
    "agent_safe_content": true,
    "page": 1,
    "limit": 10
  }
}
```

Select candidates on metadata, then read at most the bounded set of task-relevant messages with `get_email` / `get_email_context`. Require `scan_status: clean` before using any body. `agent_safe_content` normalizes untrusted text; it does not make it trusted.

The `OPEN` message the desk sent is the authority for the pinned terms. Search for it by `deal_id` in the subject with the mailbox address as sender. If it cannot be re-read, report `HELD` rather than continuing from memory.

## Sending

`send_email` and `reply_to_email` use `body.html` and/or `body.text` - not `body` or `content` - and `body.from` is required. `save_draft` uses the string field `body.body`. Recipients are explicit: external MCP does not derive Reply-All from thread headers, so pass `to` yourself on a reply, and pass the **pinned** counterparty address, not a reply-to header taken from an inbound message.

```json
{
  "mailboxId": "MAILBOX_PUBLIC_ID",
  "idempotencyKey": "deal-7F3A2C-open",
  "body": {
    "to": "dev@example.com",
    "from": "desk@mermail.app",
    "subject": "Deal DEAL-7F3A2C - landing page",
    "text": "Offer text, then the deal block."
  }
}
```

For `reply_to_email`, the source `emailId` is a top-level path parameter; threading headers are set server-side.

## PayBox

PayBox tools appear only on full-profile MCP **OAuth** sessions. `MERMAIL_API_KEY` never authorizes them, and neither does the `agent-inbox` profile.

Call `get_paybox_connection` once with `tools/call` before saying PayBox is unavailable - absence from a host `tools/list` is not "not exposed". Reconnect only after that call returns unknown-tool, method-not-found, or a hard fail. If it returns `connect_handoff`, `reauth_handoff`, or `OWNER_ACTION_REQUIRED`, paste the returned `console_url` once and pause.

Read the asset's `token` address from `paybox_get_portfolio` instead of guessing it. Then call `paybox_request_transfer` once, with live-schema arguments, the pinned amount, and the pinned payout address as destination. Do **not** call `prepare_destructive_action` for PayBox tools - PayBox owns transaction policy, signing, and approval. Do not substitute `create_agent_wallet_transfer_proposal`, `paybox_request_swap`, or `paybox_pay_x402`; those are different operations.

On `pending_signature` / `pending_approval`, prefer a PayBox MCP App frame that shows a real signing control; otherwise paste the one returned invocation-scoped `signing_handoff.console_url` and stop. Never construct that URL and never call `reopen_signing_window` from the model. After the user signs, poll `paybox_get_request` once - `get_paybox_invocation` reports MCP invocation state and is not proof of settlement.

## Credits and plans

Mailbox provisioning costs 10 provision credits and needs workspace admin access; reuse a mailbox instead. The Free plan allows one mailbox, so a two-sided demo uses one Mermail mailbox and an ordinary external address as the counterparty. Business calls remain subject to workspace scope, plan access, RPM limits, credits, and external recipient limits.
