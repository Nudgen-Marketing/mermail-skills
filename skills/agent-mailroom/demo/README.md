# agent-mailroom — live demo

Recorded end-to-end against the real Mermail API (mailbox `dsbroketimesagent@mermail.app`,
MCP endpoint `console.mermail.app/mcp`, tool `send_email` + `search_emails` + `get_email`).

- `mermail-demo.mp4` — 70s screencast of the full round-trip (GIF version also included)
- `mermail-demo.cast` — asciinema v3 source (playable with `asciinema play`)
- `demo.sh` — the exact script that was recorded
- `mcp_mail.py` — MCP helper used by the script (send / search / get / mailboxes)

Flow shown: prompt → Mermail connect → init (allowlist + 3 actors) → render assign
envelope → post into the real inbox → poll → fetch full message → ingest (verify
envelope, apply) → claim (24h lease) → result → post result back to the thread →
job board → verify both envelopes arrived → journal audit trail.

Every Mermail effect goes through an MCP tool; the skill itself talks to no network.
