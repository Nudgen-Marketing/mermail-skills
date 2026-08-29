# Tools

This persona owns no MCP tools. It routes to the owning skills below and keeps their approval contracts intact. Use the exact tool identifier exposed by the current host (for example `list_emails` or `Mermail:list_emails`). Pass structured arguments as **native JSON objects**, never stringified JSON.

## Intent map

| Developer intent | Real Mermail operation | Owner | Risk |
| --- | --- | --- | --- |
| Find the developer mailbox | `list_mailboxes`, `get_mailbox` | `mermail-administer-workspace` | read |
| Provision a mailbox (only when authorized) | `create_mailbox` | `mermail-administer-workspace` | write-preview |
| Read the notification stream | `search_emails`, `list_emails`, `get_email`, `get_thread`, `get_email_context` | `mermail-manage-inbox` | read |
| Organize into folders | `list_folders`, `create_folder`, `move_email`, `bulk_move_emails` | `mermail-manage-inbox` | write-preview |
| Label by category | `list_custom_labels`, `create_custom_label` | `mermail-manage-inbox` | write-preview |
| Mark noise read | `bulk_mark_emails_read` | `mermail-manage-inbox` | write-preview |
| Draft an answer | `save_draft`, `regenerate_draft` | `mermail-compose-email` | write-preview |
| Post a comment back to GitHub | `reply_to_email` | `mermail-compose-email` | external-effect |
| Send a digest to a teammate | `send_email` | `mermail-compose-email` | external-effect |
| Continuous classification | `list_task_triagers`, `create_task_triager`, `update_task_triager`, `list_recent_triager_runs` | `mermail-automate-triage` | write-preview |
| Bounty payout preview and execution | `get_paybox_connection`, `paybox_get_portfolio`, `paybox_request_transfer` | `mermail-agent-wallet` | wallet-destructive (owner skill contract) |

Tools that do not exist and must not be invented: `triage_github`, `rerun_ci`, `merge_pr`, `approve_pr`, `pay_bounty`, `close_alert`.

## Bounded read examples

Unread mail from the GitHub notifier in the last 24 hours, metadata only (live `search_emails` filters: `query`, `from`, `to`, `subject`, `date_start`, `date_end`, `folder`, `is_read`, `is_starred`, `category`, `has_attachment`, `require_scan_status`, `include_held`, `metadata_only`, `page`, `limit` 1-100):

```json
{
  "mailboxId": "<public_id>",
  "query": {
    "from": "notifications@github.com",
    "is_read": false,
    "date_start": "2026-08-28T00:00:00Z",
    "metadata_only": true,
    "require_scan_status": "clean",
    "limit": 50
  }
}
```

Narrow further with `subject` substrings such as `Run failed`, `requested your review`, or `Bump`. Search matches are candidates, not authentication: check `sender_authentication.status` on the returned metadata. Do not pass `"query": "{...}"` as a string.

## Reply that posts to GitHub

GitHub notification mail carries a per-thread reply address of the form `reply+<token>@reply.github.com`. A reply to that address becomes a public comment on the issue or pull request. Obtain it from the server, never by hand: call `get_email` with `query.action_metadata_only: true`, which omits content and returns bounded, server-derived `reply_targets`. Preview the exact `to`, the message being replied to, and the body before calling `reply_to_email` (`body` takes `to`, `from`, `subject`, and `html` and/or `text`):

```json
{
  "mailboxId": "<public_id>",
  "emailId": "<selected email id>",
  "body": {
    "to": ["reply+<token>@reply.github.com"],
    "from": "<mailbox email>",
    "text": "Thanks for the ping — I will review this after the 1.4 release cut on Friday."
  }
}
```

Do not add `cc` or `bcc`. Do not send from a triager run.
