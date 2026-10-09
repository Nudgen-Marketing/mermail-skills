# RFQ Desk Tool Mapping

This skill owns zero MCP tools. All operations are composed from canonical Mermail skills without duplicate ownership.

## Intent to Tool Mapping

| Procurement RFQ Intent | Canonical MCP Tool | Owning Skill |
| :--- | :--- | :--- |
| Locate procurement mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Find RFQ threads & quotes | `search_emails` | `mermail-manage-inbox` |
| Inspect quote message | `get_email` | `mermail-manage-inbox` |
| Inspect full quote thread | `get_email_context` | `mermail-manage-inbox` |
| Retrieve price sheet attachment | `download_attachment` | `mermail-manage-inbox` |
| Save vendor clarification draft | `save_draft` | `mermail-compose-email` |
| Send approved clarification | `reply_to_email` | `mermail-compose-email` |

## Prohibited / Invented Tools

The following operations do not exist in Mermail MCP and must NEVER be called or simulated:

- `compare_quotes` (perform comparative normalization analytically in agent output)
- `approve_rfq` (decisions belong to the human owner)
- `create_purchase_order` / `issue_po` (purchasing commitment is human responsibility)
- `calculate_freight` (never guess or invent freight costs)
- `execute_payment` (payment execution is strictly prohibited)
