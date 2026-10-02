# Mermail tools used

This persona composes existing Mermail tools and owns none. Resolve live names and schemas from the current MCP catalog. Follow the focused skill references for exact argument contracts.

| Workflow step | Existing tool | Owning skill | Use |
| --- | --- | --- | --- |
| Resolve workspace and mailbox | list_workspaces, list_mailboxes | mermail-administer-workspace | Choose one workspace and one exact enabled mailbox; prefer public_id. |
| Find candidate renewal messages | search_emails | mermail-manage-inbox | Bounded date and text filters; metadata-only first pass; native JSON query. |
| Read a selected notice | get_email | mermail-manage-inbox | Exact mailbox/email IDs; require clean scan and agent-safe content; bound body length. |
| Resolve a date in one conversation | get_email_context | mermail-manage-inbox | Only after selecting one email; keep the returned cursor/page bound. |
| Save an unsent vendor draft | save_draft | mermail-compose-email | Only after user selects the vendor, goal, recipient, and approves the draft content. Never send from this skill. |

Do not call invented list_subscriptions, cancel_subscription, or billing tools. Do not use Agent Wallet or x402 tools for renewal work.

## Search boundaries

- Use the current live schema for search_emails; do not stringify the query object.
- Search only the owner-selected mailbox and agreed date range.
- Use metadata_only: true and agent_safe_content: true for discovery. Read bodies only for deduplicated candidate IDs.
- Cap each search at 25 results, and the combined review at 60 unique messages. If the cap is reached, report the cap and ask before expanding the search.
- get_email should use the exact returned emailId, require_scan_status: clean, agent_safe_content: true, and an appropriate max_body_chars.
- save_draft is the only write used here. It is an internal unsent draft; it does not authorize delivery.
