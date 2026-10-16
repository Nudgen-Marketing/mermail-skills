# Tools this skill may call

This skill adds no MCP tool. `scripts/decide.mjs` is a local pure function. It does not send mail and it does not call PayBox.

| Step | Tool | Approval |
| --- | --- | --- |
| Resolve the sender mailbox | `list_mailboxes` | none |
| Read one requester reply | `search_emails`, `get_email` | none |
| Send the canonical notice once | `send_email` | external effect, exact preview |
| Optional unsent copy while the packet is still changing | `save_draft` | none |

`send_email` arguments use the composition contract: top-level `mailboxId` prefers `public_id`; `body.from`, `body.to`, `body.subject`, and `body.text` carry the notice. Do not put the notice in `body.body` (that field is for `save_draft`). Pass `idempotencyKey` as the notice digest and reuse it only for the identical payload.

`query` on `search_emails` is a JSON object, not a string. Pass `sender_authentication` and `scan_status` from `get_email` into the decider without rewriting the verdict. Copy camelCase provider fields into the decider's snake_case fields so the classifier sees them. Do not take the first nested id, and do not treat a send response as `get_email`.

Route support triage to `mermail-support-agent` and x402 payment to `mermail-x402-agent`. Do not borrow their tools from this workflow.
