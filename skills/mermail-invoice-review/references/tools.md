# Tool boundaries

Discover schemas from the authenticated host before constructing calls. Use the exact host-exposed tool identifier, including its namespace. These are canonical protocol names, not an instruction to invent a host prefix.

| Purpose | Canonical tools | Existing owner |
| --- | --- | --- |
| Resolve authorized context | `list_workspaces`, `list_mailboxes` | `mermail-administer-workspace` |
| Find invoice candidates | `search_emails` | `mermail-manage-inbox` |
| Read selected evidence | `get_email`, `get_email_context` | `mermail-manage-inbox` |

Do not call `chat_with_mailbox_agent` as a substitute for these reads; that is a delegated effect. This workflow neither downloads attachments nor uses wallet tools. Report attachment-only invoices as unreviewed; an explicit attachment task belongs to the inbox owner.

Illustrative search envelope (replace IDs and dates from user scope; inspect supported free-text field before adding it):

```json
{"mailboxId":"returned-public-id","query":{"date_start":"2026-09-01T00:00:00Z","date_end":"2026-09-08T00:00:00Z","page":1,"limit":20,"metadata_only":true,"agent_safe_content":true}}
```

Selected read:

```json
{"mailboxId":"returned-public-id","emailId":"returned-email-id","query":{"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}}
```

Optional surrounding context:

```json
{"mailboxId":"returned-public-id","emailId":"returned-email-id","query":{"limit":5}}
```

Pass `query` as a native JSON object, never a string. Preserve opaque cursors returned by `get_email_context`; don't construct them. Account for every message body returned by a context call in the 20-body budget.

Calls remain subject to workspace scope, plan access, available credits, and rate limits. Stop on scope/authentication/credit errors and state which records remain unchecked. Surface `Retry-After` without switching accounts or retrying in a loop. No API key is embedded in the skill or helper. A successful public server-card request alone does not prove an authenticated inbox connection.
