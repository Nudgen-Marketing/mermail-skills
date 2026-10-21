# agent-mailroom — live demo

Recorded end-to-end against the real Mermail API (mailbox `dsbroketimesagent@mermail.app`,
MCP endpoint `console.mermail.app/mcp`, tool `send_email` + `search_emails` + `get_email`).

- [Submitted 70s MP4](https://github.com/junkiesolver/mermail-skills/blob/a7773aae016e12bbae0eca1147eaf9f889be9022/skills/agent-mailroom/demo/mermail-demo.mp4) / [GIF](https://github.com/junkiesolver/mermail-skills/blob/a7773aae016e12bbae0eca1147eaf9f889be9022/skills/agent-mailroom/demo/mermail-demo.gif)
- [Submitted two-minute MP4](https://github.com/junkiesolver/mermail-skills/blob/a7773aae016e12bbae0eca1147eaf9f889be9022/skills/agent-mailroom/demo/mermail-demo-2min.mp4) / [GIF](https://github.com/junkiesolver/mermail-skills/blob/a7773aae016e12bbae0eca1147eaf9f889be9022/skills/agent-mailroom/demo/mermail-demo-2min.gif)
- `mermail-demo.cast` — asciinema v3 source (playable with `asciinema play`)
- `demo.sh` — the exact script that was recorded
- `mcp_mail.py` — MCP helper used by the script (send / search / get / mailboxes)

Flow shown: prompt → Mermail connect → init (allowlist + 3 actors) → render assign
envelope → post into the real inbox → poll → fetch full message → ingest (verify
envelope, apply) → claim (24h lease) → result → post result back to the thread →
job board → verify both envelopes arrived → journal audit trail.

Every Mermail effect goes through an MCP tool; the skill itself talks to no network.

Video/GIF binaries remain in the source repository, but are excluded from the install bundle to respect its size limit. These are the original submission recordings, not evidence that the current changed head has passed live E2E. No demo script, email delivery or background polling is automatically run during installation or validation.
