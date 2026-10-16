# Mermail connector contract

Use the exact identifiers and argument schema from the connected Mermail MCP catalog (`tools/list`); host prefixes vary. The official Mermail skills at https://github.com/Nudgen-Marketing/mermail-skills own tool contracts. Do not invent endpoints or use a regular personal inbox as if it were a Mermail workspace.

- `list_mailboxes` returns the exact authorized mailbox ID (`public_id` preferred). Resolve ambiguity before reading.
- `search_emails`: pass `mailboxId` and native `query` object, not a stringified JSON object. Use `date_start`, `date_end`, `page`, `limit`, `sortColumn: "date"`, `sortDirection: "DESC"`, `metadata_only: true`, `agent_safe_content: true`. Search separately for lost and found terms, dedupe by exact email ID and exhaust within the bounded scope. Text hits are candidates, not proof of direction or sender identity.
- `get_email`: exact mailbox and email IDs, `query: {"require_scan_status":"clean","agent_safe_content":true,"max_body_chars":10000}`. `content_omitted` or mismatched status means metadata only.
- `get_email_context`: selected ID and bounded context where the conversation matters; inspect sender-security evidence before attributing a message.
- `save_draft`: `mailboxId`, `body: {"to": "exact@example.test", "subject": "...", "body": "..."}`; this is unsent. `reply_to_email` requires selected `emailId` and explicit `body.from`, `body.to`, and `body.text` or `body.html`. `send_email` requires the same explicit sender and recipients. Delivery is an external effect; check the host's authorization and recipient limits, then verify the returned sent status. Never infer reply targets from display names or send as a smoke test.

See official manage-inbox and compose-email skill references for full envelopes and current limits. No Mermail workspace is bundled with this repository.
