# Demo — mermail-research-digest-agent

Live run recorded 2026-08-26 on a real Mermail workspace via Hermes (official integration).

**Video:** [original recorded demo](https://github.com/shojaee76-cmyk/mermail-skills/blob/0e3422778342ff116e0b52dee3ba1b3652662e0d/demo/demo.mp4) (2 min 52 s, 1080p, English narration)

The recording remains in GitHub; `.clawhubignore` excludes only recorded MP4 and generated Python bytecode from the installed bundle to respect the registry's multipart limit. Skill instructions, references, helper scripts, tests and screenshots remain included. This historical recording is not evidence that the later consolidation has been live-rehearsed.

## What the video shows (all steps real, no mockups)

| Skill workflow step | Evidence in run |
|---|---|
| Prompt triggers skill | "Use mermail-research-digest-agent: digest this week's subscriptions..." |
| MCP connection | `hermes mcp add mermail --url https://console.mermail.app/mcp --auth oauth` -> 79 tools discovered |
| Collect (scan-clean only) | `list_emails` -> 7 clean inbox items, genuinely inbound (sent from an external Gmail account) |
| Read (bounded) | `get_email` per item, `scan_status: clean` required before interpretation |
| Classify | 5 kept / 2 dropped (prize scam + welcome boilerplate); drops reported, not silent |
| Cluster + cite | 5 themes; every claim cites sender + subject + message-id |
| Deliver draft-first | `save_draft` -> draft `fb530426-9dc5-4f21-a4f3-9603580fe887` addressed to the user |
| Approved send | one customer-facing write after explicit user approval of the exact preview |

## AI client

Hermes Agent (listed on mermail.app Integrations), driving the hosted MCP at `https://console.mermail.app/mcp` with OAuth.

## Validation

`npm test` green: "Validated 16 skills and 71 business tools."

Built for the Superteam Earn bounty "Build and Demo a Mermail Agent Skill".
