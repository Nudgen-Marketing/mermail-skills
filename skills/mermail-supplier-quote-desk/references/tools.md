# Supplier quote desk tool contract

This skill owns no MCP tools. It uses the tools below, owned by other Mermail skills. Do not call or invent other tool names.

| Intent | Tool | Effect |
| --- | --- | --- |
| Find the receiving mailbox | `list_mailboxes` | Read |
| Find quotation emails | `list_emails`, `search_emails` | Read |
| Read an email or thread | `get_email`, `get_thread` | Read |
| Save the reply draft | `save_draft` | Internal write |
| Send the approved reply | `reply_to_email` | External effect |

## Argument rules

- Pass Mermail API fields under the tool's `body` argument. Path parameters such as `mailboxId` and `emailId` stay top-level.
- Prefer the mailbox `public_id` from `list_mailboxes` as `mailboxId`.
- `save_draft` uses the string field `body.body`.
- `reply_to_email` uses `body.html` and/or `body.text`, plus required `body.from`. Pass the selected source `emailId` as a top-level path parameter.
- Recipients are explicit. MCP does not derive Reply or Reply All recipients, so pass `to` yourself.
- Include an `idempotencyKey` on the send so a retry cannot deliver twice.
- Use metadata-only reads until the body is needed, and require `scan_status: clean` before reading a body or attachment.

For exact argument shapes of the read tools, follow `mermail-manage-inbox`. For send and reply details, follow `mermail-compose-email`.