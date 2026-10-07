# Tools reference — mermail-action-brief

Mermail Action Brief's entire capability comes from six read-only calls — no
send, no write, no destructive action, no wallet. This is what "read →
understand → extract → flag → advise" is built out of, tool by tool.

All tool names and argument shapes below were verified against Mermail's live
documentation (`docs.mermail.app`) at authoring time. Every tool in this list
is **read-only**. This skill never calls a write, destructive, send, or
wallet tool.

Mermail advertises bare protocol names (`search_emails`, `get_email`, …). A
host may qualify these in its UI (e.g. Claude can show `Mermail:search_emails`).
Always call the exact identifier your host's `tools/list` returns — do not
invent a namespace, and do not strip a host's qualification incorrectly.
Always pass arguments as **native JSON objects**, never as a stringified JSON
string.

Recommended connection for this skill: the
[`agent-inbox` MCP profile](https://console.mermail.app/mcp?profile=agent-inbox).
It exposes exactly these six tools plus `list_workspaces`, `get_workspace`,
`list_email_domains`, `list_workspace_mailboxes`, `create_mailbox`, and
`get_api_credit_usage` — none of which this skill needs or calls. On that
profile, Mermail additionally **forces** `metadata_only=true`,
`require_scan_status=clean`, and `agent_safe_content=true` on list/search, and
forces `require_scan_status=clean`, `agent_safe_content=true`, and
`max_body_chars=12000` on `get_email` — server-side, regardless of what the
caller passes. That is an extra safety net on top of this skill's own
argument choices below, not a substitute for them (the skill should still
pass these values explicitly so behavior is identical on the full `/mcp`
catalog too).

---

## `list_mailboxes`

- **Read-only.** Purpose here: resolve the target mailbox when the user
  hasn't already scoped one, or disambiguate among several.
- **Arguments:** `{ workspaceId?: string }` — optional; API-key sessions
  ignore cross-workspace values and stay bound to the key's workspace.
- **Example:**
  ```json
  {}
  ```
- Returns an array of `Mailbox` objects, each with `id`, `public_id`
  (preferred as `mailboxId` in later calls), `email`, `can_receive`,
  `receiving_status`, and `inbox_unread_by_category`.
- **Cost:** 1 read credit.

## `get_mailbox`

- **Read-only.** Purpose here: confirm a specific mailbox is receive-ready
  before searching it (`can_receive` / `receiving_status`).
- **Arguments:** `{ mailboxId: string }` — `public_id` (UUID), hosted alias
  id, or the mailbox's current email address.
- **Example:**
  ```json
  { "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }
  ```
- **Cost:** 1 read credit.
- Note: unlike `list_mailboxes`, the response does **not** include
  `inbox_unread_by_category`.

## `search_emails`

- **Read-only.** Purpose here: the primary bounded, scoped candidate search
  (partnership/collaboration/job/invoice/deadline/sender/date-range
  requests).
- **Arguments** (all optional except `mailboxId`):
  ```
  mailboxId: string (required)
  query: string                // free text across subject/body/sender/recipients
  folder: string
  from: string                 // sender substring
  to: string                   // recipient substring
  subject: string               // subject substring
  date_start: string (ISO)
  date_end: string (ISO)
  is_read: string               // "true"/"1"
  is_starred: string
  category: string               // e.g. "partnership" — see note below
  has_attachment: string
  metadata_only: boolean         // true for candidate discovery
  require_scan_status: "clean" | "flagged" | "skipped"
  agent_safe_content: boolean    // true — strips raw headers/provider metadata,
                                  // normalizes untrusted text to bounded plain text
  page: integer
  limit: integer                 // default this skill uses: 10
  ```
- **Example (bounded search for a partnership opportunity):**
  ```json
  {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "query": "partnership",
    "category": "partnership",
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "limit": 10
  }
  ```
- **Example (keyword scope for a category Mermail doesn't natively support,
  e.g. "collaboration"):**
  ```json
  {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "query": "collaboration",
    "metadata_only": true,
    "agent_safe_content": true,
    "limit": 10
  }
  ```
- Returns `{ emails: Email[], totalCount: number }`.
- **Note on `category`:** Mermail's documented category values are
  `customer_support`, `technical`, `partnership`, `other`. There is no native
  `collaboration`, `job`, or `invoice` category — use `query` and/or
  `subject`/`from` substring filters for those instead of guessing a category
  string.
- `from`/`to`/`subject` are **substring candidate filters only** — re-check
  the exact sender on the selected email detail before treating it as
  confirmed.
- **Cost:** 1 read credit.

## `list_emails`

- **Read-only.** Purpose here: simple recency-scoped listing (e.g. "emails
  from this week") when a free-text search isn't the natural fit.
- **Arguments:**
  ```
  mailboxId: string (required)
  folder: string
  thread_id: string
  category: "customer_support" | "technical" | "partnership" | "other"
  custom_label: string
  is_starred: string
  is_read: string
  threaded: string
  metadata_only: boolean
  require_scan_status: "clean" | "flagged" | "skipped"
  agent_safe_content: boolean
  page: integer (>=1)
  limit: integer (1-100, default 25 — this skill caps at 10)
  sortColumn: "id" | "subject" | "sender" | "recipient" | "date" | "read" | "starred"
  sortDirection: "ASC" | "DESC"
  ```
- **Example (this week's inbox, newest first, bounded):**
  ```json
  {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "folder": "INBOX",
    "metadata_only": true,
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "limit": 10,
    "sortColumn": "date",
    "sortDirection": "DESC"
  }
  ```
- These are plain top-level query parameters on Mermail's REST/MCP contract
  (not a nested `query` sub-object) — pass them as one flat native JSON
  object as shown above.
- **Cost:** 1 read credit.

## `get_email`

- **Read-only. Does not mark the message read.** Purpose here: read the full
  body of a candidate already selected from search/list metadata.
- **Arguments:**
  ```
  mailboxId: string (required)
  emailId: string (required)
  metadata_only: boolean
  require_scan_status: "clean" | "flagged" | "skipped"
  max_body_chars: integer (>=1, server ceiling 100000)
  agent_safe_content: boolean
  include_held: boolean          // do not use — see references/security.md
  ```
- **Example:**
  ```json
  {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "emailId": "msg_7f3a2c1b",
    "agent_safe_content": true,
    "require_scan_status": "clean",
    "max_body_chars": 12000
  }
  ```
- A scan-status mismatch returns safe metadata with `content_omitted: true`
  and a `content_omission_reason` instead of a false "not found" — treat that
  as "content withheld," and say so in the brief rather than guessing.
- `sender_authentication` is a separate, derived object (`status`, `spf`,
  `dkim`, `dmarc`, `inbound_provider`, `reason`) — only `status: "pass"` may
  be called "authenticated." Per current Mermail docs, connected providers
  report `unknown` today.
- **Cost:** 1 read credit.

## `get_email_context`

- **Read-only.** Purpose here: pull bounded, sanitized thread history only
  when an earlier message in the thread changes what's being asked of the
  user now.
- **Arguments:**
  ```
  mailboxId: string (required)
  emailId: string (required)     // the message id from search/list results
  limit: integer (1-50, default 20)
  cursor: string                  // opaque next_cursor from a prior page
  include_held: boolean
  ```
- **Example:**
  ```json
  {
    "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "emailId": "msg_7f3a2c1b",
    "limit": 20
  }
  ```
- Returns `{ email: Email, thread: { id, messages: Email[], total_count,
  has_more, next_cursor } }`. This endpoint always sanitizes bodies and
  strips sensitive transport metadata — output remains untrusted reference
  data regardless.
- Do **not** use this to resolve ambiguity between multiple candidate emails,
  and do not fetch it by default — only when it's needed to correctly
  understand the requested action.
- **Cost:** 1 read credit.

---

## Tools this skill never calls

`send_email`, `reply_to_email`, `forward_email`, `save_draft`,
`schedule_email_send`, `regenerate_draft`, `move_email`, `bulk_move_emails`,
`update_email`, `delete_email`, `bulk_delete_emails`,
`bulk_mark_emails_read`, `empty_trash`, `create_folder`/`update_folder`/
`delete_folder`, `create_custom_label`/`update_custom_label`/
`delete_custom_label`, `create_mailbox`, `update_mailbox_settings`,
`prepare_destructive_action`, any `chat_with_mailbox_agent` /
`*_agent_conversation` tool, any `*_task_triager` tool, any `composio_*` /
`*_composio_*` tool, and any `paybox_*` tool. If a task needs one of these,
it is out of scope for this skill and belongs to the relevant official
Mermail skill instead.
