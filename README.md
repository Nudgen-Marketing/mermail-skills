# Mermail Agent Skills

Portable Agent Skills for operating Mermail through its production MCP server. The pack covers inbox management, email composition, workspace administration, triage automation, and mailbox-agent workflows.

## Install

Install the complete pack:

```bash
npx skills add Nudgen-Marketing/mermail-skills
```

Or install a focused skill:

```bash
npx skills add Nudgen-Marketing/mermail-skills --skill mermail-compose-email
```

## Connect Mermail MCP

Configure your MCP client with:

- Transport: Streamable HTTP
- URL: `https://console.mermail.app/mcp`
- Header: `x-api-key: sk-proj-...`

Create the API key in Mermail workspace settings and keep it in the client's secret store. Never commit the key to a repository or paste it into a skill file.

## Included skills

| Skill | Purpose |
| --- | --- |
| `mermail` | Route broad or cross-domain requests |
| `mermail-manage-inbox` | Read, search, organize, and clean up inboxes |
| `mermail-compose-email` | Draft, send, reply, forward, and schedule email |
| `mermail-administer-workspace` | Manage workspaces, members, domains, mailboxes, storage, and usage |
| `mermail-automate-triage` | Configure and inspect task triage automation |
| `mermail-mail-agent` | Work with mailbox-agent conversations |

All business operations remain subject to the API key's workspace scope, plan, RPM limit, and available credits. External-effect and destructive operations require explicit user approval; destructive MCP tools also require a short-lived confirmation token.

## Development

```bash
npm test
npm run validate:remote
```

`validate:remote` compares the checked-in coverage manifest with the production MCP server card. Set `MERMAIL_MCP_TEST_API_KEY` only when running the optional authenticated protocol smoke test.
