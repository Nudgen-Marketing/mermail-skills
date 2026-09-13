# Tools Reference (MCP + CLI)

The skill is read-only over email. Connect the narrowest profile that can
complete the audit: the `agent-inbox` MCP profile is sufficient.

## Connect (OAuth preferred)

- MCP endpoint: https://console.mermail.app/mcp?profile=agent-inbox
- Supported hosts: Hermes, Claude, Codex, Cursor, OpenClaw (OAuth; no key in config)

API-key fallback (headless jobs; PayBox unavailable with this path):

    export MERMAIL_API_KEY=sk-proj-...   # Settings -> API Keys

## Operations Used

| Step | MCP tool (agent-inbox profile) | CLI equivalent |
| --- | --- | --- |
| Resolve mailbox | mailbox list / get | mermail mailboxes list |
| Triage new mail | message search (received since cursor) | mermail messages search |
| Read message | message get (headers + body text) | mermail messages get |
| Attachment text | attachment get (text extraction) | mermail attachments get |

All other tool families (send, triager configuration, workspace admin,
wallet/PayBox) are out of scope for this skill and must stay disconnected.

## Ingestion Cursor

Keep the audit cursor in state.json next to the ledger:

    {"mailbox_id": "mb_...", "last_seen_at": "2026-09-13T00:00:00Z", "last_message_id": "msg_..."}

Poll pattern: search received_at > cursor, sort ascending, advance the cursor
only after the message is ingested or quarantined (crash-safe re-run).
