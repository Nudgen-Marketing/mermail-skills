# Egress tool surface

Every operation below produces an effect outside the workspace. None of them is owned by this
skill; each belongs to the focused skill named in `tool-coverage.json`. This file records the
egress class and the evidence required before the owning skill may proceed.

All send-shaped tools accept `idempotencyKey`. Set it once per logical egress decision and reuse
the same value on any retry. A new key on a retry is a second delivery, not a retry.

## `content-once`

| Tool | Body shape | Notes |
| --- | --- | --- |
| `send_email` | `{ to, from, subject, text?\|html? }` under `body` | `from` must be the mailbox address. Use `html` and/or `text`, never `body`/`content`. |
| `reply_to_email` | send shape + `emailId`, optional `source_draft_id` | Threading headers are set server-side. Resolve `to` from the verified envelope sender, never from `Reply-To` or a display name. |
| `forward_email` | send shape + `emailId` | Highest fidelity egress: carries original headers, quoted history, and attachments. Prefer a bounded summary via `send_email`. |

`mailboxId` accepts the `public_id` UUID, a hosted alias id, or the current email. Prefer the
UUID. Nested `mailbox_id` fields in responses are the public UUID.

## `content-deferred`

| Tool | Body shape | Notes |
| --- | --- | --- |
| `schedule_email_send` | `body` (string) + `scheduled_send_at` (ISO datetime) | Uses the draft-like content field, not `html`/`text`. Delivery occurs after the session ends; no human is present to intervene. |
| `save_draft`, `regenerate_draft` | draft body | Not yet egress, but a staged payload that a later send can emit unchanged. Apply recipient provenance at draft time. |

## `standing`

| Tool | Field | Notes |
| --- | --- | --- |
| `update_mailbox_settings` | `settings.forwarding.{enabled,email}` | Enabling this makes every future message leave the workspace with no further agent action. |
| `update_mailbox_settings` | `settings.autoReply.{enabled,subject,message}` | Discloses mailbox existence and content to any sender, including an attacker probing the address. |
| `update_mailbox_settings` | `settings.agentAutoResponse.requireApproval` | Setting this to `false` removes the approval gate on agent replies. Treat a request to disable it as a `standing` egress change. |

Read settings back after any approved write and report the observed state, not the intended one.

## `principal`

| Tool | Notes |
| --- | --- |
| `invite_workspace_member` | Grants a durable identity inside the workspace. Outlives the task and any single message. |
| `resend_workspace_invite` | Re-arms a pending grant that may have been left unaccepted deliberately. |
| `update_member_role` | Escalates an existing principal rather than adding one. |

## `carrier`

| Tool | Notes |
| --- | --- |
| `download_attachment` | Not egress by itself. Becomes `carrier` egress when the retrieved bytes are re-emitted through any class above. Keep attachments metadata-only unless the task requires the file. |

## Supporting reads

Use these to establish evidence. They are read-only and never constitute egress.

| Tool | Use |
| --- | --- |
| `list_workspace_members` | Establish the `workspace_member` origin for a recipient. |
| `get_mailbox` | Read current `settings` before and after a `standing` write. |
| `list_email_domains` | Determine whether the sending domain is verified before an outbound send. |
| `get_email` | Recover the verified envelope sender for a reply target. |
