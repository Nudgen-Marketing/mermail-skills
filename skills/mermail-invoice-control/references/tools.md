# Invoice control tool routes

This persona owns no MCP tools. Use the exact identifier exposed by the host, including a host-qualified form such as `Mermail:get_email` when present. Pass `query` and `body` as native JSON objects, never stringified JSON.

## Intake and evidence

| Operation | Tool | Canonical owner |
| --- | --- | --- |
| Resolve mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find invoice candidates | `search_emails` or `list_emails` | `mermail-manage-inbox` |
| Read one selected invoice | `get_email` or `get_email_context` | `mermail-manage-inbox` |
| Fetch one required attachment | `download_attachment` | `mermail-manage-inbox` |
| Save the approval packet | `save_draft` | `mermail-compose-email` |

Prefer mailbox `public_id` as `mailboxId`. Use native metadata_only and agent_safe_content reads until one candidate is unambiguous, then native require_scan_status clean, agent_safe_content true and max_body_chars 10000 for selected detail. Bind workspace/mailbox/email/thread before interpretation; unknown authentication is not pass. Native safety holds, omitted/unknown scan or truncated/unseparated content remain metadata-only for the offline helper; never repair them by setting booleans locally or using raw-content fallback. See [offline-preview.md](offline-preview.md).

Example bounded search:

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "subject": "invoice",
    "date_start": "2026-09-01T00:00:00.000Z",
    "limit": 25,
    "metadata_only": true,
    "agent_safe_content": true,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
}
```

Example approval draft uses `save_draft` with a string `body.body`. Include the source message ID, normalized invoice key, owner-verified payment terms, control result, evidence gaps, and the exact approval requested.

## Optional payment

These tools require eligible full-profile MCP OAuth. API keys and the agent-inbox profile do not expose PayBox.

| Operation | Tool | Rule |
| --- | --- | --- |
| Check PayBox | `get_paybox_connection` | Probe once before calling tools unavailable |
| Resolve wallet | `paybox_list_credentials` | Preserve explicit choice; ask if several eligible wallets remain |
| Verify holdings/asset | `paybox_get_portfolio` | Use returned asset identifiers; never guess |
| Request exact transfer | `paybox_request_transfer` | One approved call using the live schema |
| Reconcile known request | `paybox_get_request` | Read the original request ID once when asked |

Do not call `prepare_destructive_action` for PayBox tools. `paybox_request_transfer` uses PayBox policy, approval, and signing. Pending is not settlement.

## Optional remittance

Use `reply_to_email` only after provider-confirmed payment success and separate approval of exact workspace, sender mailbox, source email/thread, recipients and body. Mermail does not auto-fill Reply All, so provide explicit `to`, `cc`, and `bcc` values. Follow `mermail-compose-email` for the live payload (`emailId`, `body.from`, `body.text`/`body.html`); `save_draft` uses `body.body` and is not a send. Never attach private wallet material.

Finance escalations use `save_draft` for a privately selected owner recipient, never an immediate reply tool. Optional filing routes to `mermail-manage-inbox` using `list_folders` and `move_email` with resolved folder/message IDs after user authorization. No manual custom-label assignment capability is claimed.
