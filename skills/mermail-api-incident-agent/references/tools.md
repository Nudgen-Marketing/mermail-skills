# Tool map

This persona owns no MCP tools. Reuse the existing owning skills and their argument, approval, and retry contracts.

| Need | Existing operation | Owner |
| --- | --- | --- |
| Resolve incident mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Bounded incident discovery | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Read selected evidence | `get_email`, `get_thread`, `get_email_context` | `mermail-manage-inbox` |
| Save incident update | `save_draft` | `mermail-compose-email` |
| Approved reply | `reply_to_email` | `mermail-compose-email` |
| Approved new update | `send_email` | `mermail-compose-email` |

Prefer metadata-only discovery before body reads. Require clean scan status before interpreting body content. Keep explicit To/Cc/Bcc sets for every external send.

Do not invent webhook-retry, status-page, credential-rotation, DNS, deployment, or provider-admin tools. Those effects are outside this Mermail skill.