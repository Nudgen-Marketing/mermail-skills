# Cursor Marketplace submission checklist

Submit Mermail so it appears when users search **Mermail** on
[cursor.com/marketplace](https://cursor.com/marketplace).

Official MCP Registry (`app.mermail/mcp`) does **not** auto-list here.
Cursor Marketplace is a separate, manually reviewed plugin catalog.

## Submit URL

https://cursor.com/marketplace/publish

Repository to paste:

```text
https://github.com/Nudgen-Marketing/mermail-skills
```

## Pre-flight (repo ready)

- [x] Public GitHub repo
- [x] Single-plugin layout with `.cursor-plugin/plugin.json`
- [x] `name`: `mermail` (kebab-case)
- [x] `displayName`: `Mermail`
- [x] `description` present
- [x] `license`: `MIT` (+ root [`LICENSE`](./LICENSE))
- [x] `logo`: [`assets/logo.svg`](./assets/logo.svg)
- [x] `skills`: `./skills/` (8 workflows)
- [x] `mcpServers`: [`.cursor-plugin/mcp.json`](./.cursor-plugin/mcp.json) → hosted Streamable HTTP
- [x] Auth via `${env:MERMAIL_API_KEY}` (no secrets in repo)
- [x] README documents install + auth
- [ ] Local smoke test (below)
- [ ] Submit form + accept publisher terms
- [ ] Wait for Cursor manual review

## Local smoke test before submit

```bash
# From a clone of this repo
export MERMAIL_API_KEY="sk-proj-YOUR_KEY"
ln -sfn "$(pwd)" ~/.cursor/plugins/local/mermail
npm test
```

Then in Cursor: **Developer: Reload Window** → open MCP tools → confirm `mermail` appears and a read-only tool (e.g. `list_mailboxes`) works.

Optional connection check:

```bash
node skills/mermail-mcp/scripts/check-connection.mjs
```

## Form copy (paste into publish UI)

| Field | Value |
| --- | --- |
| Repository | `https://github.com/Nudgen-Marketing/mermail-skills` |
| Plugin name | `mermail` |
| Display name | Mermail |
| Short pitch | Give Cursor agents a real Mermail inbox over Streamable HTTP MCP — read, draft, send, triage. |
| Longer description | Mermail packages Agent Skills plus a remote MCP server (`https://console.mermail.app/mcp`, Official Registry id `app.mermail/mcp`). Users create a workspace API key (`sk-proj-…`), set `MERMAIL_API_KEY`, and install this plugin. Includes 8 skills covering inbox management, compose/send, workspace admin, task triage, and mailbox-agent chat. Destructive tools require MCP confirmation tokens. |
| Categories / tags | productivity, email, mcp, ai-agent, automation |
| Homepage | https://docs.mermail.app/ai/skills |
| Support email | contact@mermail.app |
| Company note | Submitting for Mermail / Nudgen Marketing (contact@mermail.app). Form may show “individual” — please list under Mermail. |

## After approval

1. Confirm https://cursor.com/marketplace search for **Mermail** returns the plugin.
2. Update landing `/agents` Cursor note from “team marketplace / local” → “install from Cursor Marketplace”.
3. For later releases: bump `version` in `package.json` + all plugin manifests, push, and request re-index/review (updates are also manually reviewed).

## Parallel discovery (optional)

- [cursor.directory](https://cursor.directory) — community MCP/plugin directory (often suggested while waiting for Marketplace review)
- Team marketplace: Cursor Dashboard → Plugins → Import this repo (Teams/Enterprise)

## References

- [Plugins docs](https://cursor.com/docs/plugins)
- [Plugins reference](https://cursor.com/docs/reference/plugins)
- [Marketplace publisher terms](https://cursor.com/marketplace-publisher-terms)
- [Plugin template](https://github.com/cursor/plugin-template)
