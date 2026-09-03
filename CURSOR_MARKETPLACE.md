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
- [x] `skills`: `./skills/` (15 workflows)
- [x] `mcpServers`: [`.cursor-plugin/mcp.json`](./.cursor-plugin/mcp.json) → hosted Streamable HTTP
- [x] OAuth discovery through the hosted MCP endpoint (no secrets or manual environment variables)
- [x] README documents install + auth
- [ ] Local smoke test (below)
- [ ] Submit form + accept publisher terms
- [ ] Wait for Cursor manual review

## Local smoke test before submit

```bash
# From a clone of this repo
ln -sfn "$(pwd)" ~/.cursor/plugins/local/mermail
npm test
```

Then in Cursor: **Developer: Reload Window** → open MCP tools → select **Authenticate** → approve Mermail OAuth → confirm `mermail` appears and a read-only tool (for example `list_mailboxes`) works.

## Form copy (paste into publish UI)

| Field | Value |
| --- | --- |
| Repository | `https://github.com/Nudgen-Marketing/mermail-skills` |
| Plugin name | `mermail` |
| Display name | Mermail |
| Short pitch | Give Cursor agents a real Mermail inbox over Streamable HTTP MCP — read, draft, send, triage. |
| Longer description | Mermail packages 15 Agent Skills plus a hosted Streamable HTTP MCP server (`https://console.mermail.app/mcp`, Official Registry id `app.mermail/mcp`). Install the plugin, authenticate with Mermail OAuth, and use agent inboxes, verification mail, inbox management, compose/send, workspace admin, task triage, mailbox-agent chat, Composio integrations, scheduling, GTM, support, and x402/Agent Wallet workflows. Destructive tools require MCP confirmation tokens. |
| Categories / tags | productivity, email, mcp, ai-agent, automation |
| Homepage | https://docs.mermail.app/ai/skills |
| Support email | contact@mermail.app |
| Company note | Submitting for Mermail / Nudgen Marketing (contact@mermail.app). Form may show “individual” — please list under Mermail. |

## After approval

1. Confirm https://cursor.com/marketplace search for **Mermail** returns the plugin.
2. Update landing `/agents` Cursor note from “team marketplace / local” → “install from Cursor Marketplace”.
3. For later releases: bump `version` in `package.json` + all plugin manifests, push, and request re-index/review (updates are also manually reviewed).

## Cursor Directory

Cursor Directory is the community directory and currently documents web submission of a GitHub repo URL, not a supported CI publish API. Use:

```text
https://cursor.directory/plugins/new
```

Submit this repository:

```text
https://github.com/Nudgen-Marketing/mermail-skills
```

The workflow [`.github/workflows/cursor-directory.yml`](./.github/workflows/cursor-directory.yml) validates the repo metadata Cursor Directory auto-detects and writes the exact submit URL into the job summary.

## Parallel discovery (optional)

- [cursor.directory](https://cursor.directory) — community MCP/plugin directory
- Team marketplace: Cursor Dashboard → Plugins → Import this repo (Teams/Enterprise)

## References

- [Plugins docs](https://cursor.com/docs/plugins)
- [Plugins reference](https://cursor.com/docs/reference/plugins)
- [Marketplace publisher terms](https://cursor.com/marketplace-publisher-terms)
- [Plugin template](https://github.com/cursor/plugin-template)
