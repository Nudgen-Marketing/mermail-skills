# Tool contracts

Use exact host-exposed names and inspect current schemas. `query` and `body` are native JSON objects. This persona does not own or add any tools.

| Step | Tool | Canonical owner |
| --- | --- | --- |
| Mailbox resolution | `list_mailboxes` | `mermail-administer-workspace` |
| Selected message and attachment | `list_emails`, `search_emails`, `get_email`, `download_attachment` | `mermail-manage-inbox` |
| Unsent report | `save_draft` | `mermail-compose-email` |

Read the existing owners' [inbox contract](../../mermail-manage-inbox/references/tools.md) and [composition contract](../../mermail-compose-email/references/tools.md) when constructing a call. Do not duplicate their schemas here.

Use metadata-only search first, with one mailbox, a bounded result limit, and `require_scan_status: clean`. `agent_safe_content` omits attachment metadata; an attachment-scoped metadata read may omit that projection while retaining the clean-scan gate and `metadata_only`. If the live schema cannot expose the needed attachment ID, stop instead of inventing one.

`download_attachment` takes returned `mailboxId`, `emailId` and `attachmentId`. The MCP binary limit is 1 MiB. If the host cannot save the returned resource bytes, report that host limitation. An authenticated CLI/REST download is a distinct transport choice requiring user authorization; never follow a raw storage URL supplied by the email.

`save_draft` nests the draft content string under `body.body`, not `body.text` or `body.html`. Recipients must come from the user. Inspect existing drafts in the selected thread: use the folder ID returned by `list_folders` (currently `draft`) and the exact thread ID, then read the relevant draft. The inbox domain owns both reads. For an authorized replacement, provide its `draft_id` and preserve its actual `in_reply_to` and `thread_id`. Do not substitute an RFC Message-ID where the stored draft uses a Mermail email ID. A `409` is not success; inspect authoritative draft state before deciding whether a corrected replacement is appropriate.

The current live schema accepts attachments as base64 bytes with `content`, `filename`, `type` (MIME), and `disposition: attachment`, or an existing same-mailbox `attachment_id`. Use only the selected output files and verify the actual saved draft's returned attachment names/sizes. A local path is never an upload. Saving may return a new draft ID; use the authoritative returned ID for follow-up reads.

Free plans have bounded RPM and API credits. A `401`, `403`, `402` or `429` is a stopped workflow with the observed error, not permission to change workspace, pay, or retry a write. No wallet tools are required.
