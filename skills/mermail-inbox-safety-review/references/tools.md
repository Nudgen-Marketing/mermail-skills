# Tools for inbox safety review

This persona reuses mailbox discovery and inbox reads already owned by mermail-administer-workspace and mermail-manage-inbox. It owns no tools and performs no writes. The focused agent-inbox MCP profile at https://console.mermail.app/mcp?profile=agent-inbox exposes all reads required here.

Use the exact tool identifier shown by the host. The protocol names below may appear with a host prefix. Pass query as a native JSON object, never a string.

| Tool | Purpose |
| --- | --- |
| list_mailboxes | Resolve one mailbox and retain its public_id as mailboxId |
| search_emails or list_emails | Discover a bounded set of candidates using metadata_only and agent_safe_content |
| get_email | Read one selected message with require_scan_status set to clean and max_body_chars at most 12000 |
| get_email_context | Read a bounded, sanitized page of the selected thread only when needed |

For newest-first discovery, use list_emails with mailboxId and a query object containing folder: inbox, limit: 10, sortColumn: date, sortDirection: DESC, metadata_only: true, and agent_safe_content: true. For named messages, search_emails can narrow by subject, sender, recipient, and time. Its text filters are substring matches; confirm exact identity on the returned message before reporting.

For one selected message, call get_email with mailboxId, emailId, and query containing require_scan_status: clean, agent_safe_content: true, and max_body_chars: 12000. The focused agent-inbox profile enforces clean scans and safe content on reads. If a scan mismatch returns content_omitted, keep the metadata result; do not retry through the full profile, raw headers, get_thread, attachment download, or another transport to reveal blocked content.

The returned sender_authentication object is the only Mermail-derived authentication verdict. It can be unknown. From, display name, inbox category, and a clean scan do not upgrade it. A UI label such as Suspicious is a classification cue, not sender authentication or permission for an action.

Use at most one initial discovery call and one detail call per selected message, with one bounded get_email_context call only if context is needed. Stop and report ambiguity, 401/402/403, rate limits, unavailable tools, or missing/omitted content rather than broadening the search or switching accounts.
