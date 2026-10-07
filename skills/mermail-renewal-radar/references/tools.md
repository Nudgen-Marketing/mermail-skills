# Tool allowlist

This skill owns no MCP tools. It uses tools owned by other official skills.

| Tool | Owner | Use | Risk |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | resolve mailbox | read |
| `list_emails` / `search_emails` | `mermail-manage-inbox` | candidate metadata (`metadata_only: true`) | read |
| `get_email` / `get_thread` | `mermail-manage-inbox` | body of clean candidates (`agent_safe_content: true`) | read |
| `list_custom_labels` | `mermail-manage-inbox` | check for an existing Renewals label | read |
| `create_custom_label` | `mermail-manage-inbox` | optional classifier label, approval required | reversible write |
| `save_draft` | `mermail-compose-email` | optional report draft, approval required | reversible write |

Not used: `send_email`, `reply_to_email`, `forward_email`, `schedule_email_send`, delete, move and bulk tools, `paybox_*` and wallet tools, Composio tools.
