# Claude plugin directory submission checklist

The Claude community plugin marketplace (`anthropics/claude-plugins-community`) is a read-only mirror. Pull requests to that repository are closed automatically. Submit through Anthropic's form, and the internal review pipeline adds the listing after automated validation and security review.

## Submit URL

https://clau.de/plugin-directory-submission

Repository to submit:

```text
https://github.com/Nudgen-Marketing/mermail-skills
```

After approval, users install with:

```bash
claude plugin marketplace add anthropics/claude-plugins-community
claude plugin install mermail@claude-community
```

The listing is pinned to a commit SHA. Later updates reach the directory through Anthropic's SHA bump pipeline, not through PRs to that repository.

## Listing copy

| Field | Value |
| --- | --- |
| Plugin name | `mermail` |
| Short description | Privacy-first email inboxes and workspace automation for AI agents through Mermail MCP. |
| Homepage | https://mermail.app |
| Docs | https://docs.mermail.app/ai/skills |
| Support | contact@mermail.app |
| Privacy | https://mermail.app/privacy |
| Terms | https://mermail.app/terms |
| License | MIT |

Long description:

```text
Mermail gives Claude its own email inboxes. The plugin connects to the hosted Mermail MCP server (Streamable HTTP, OAuth) and ships workflow skills for provisioning agent inboxes, receiving verification mail, searching and reading threads, drafting and sending mail with approval, triaging tasks, and administering workspaces and webhooks. Sends and destructive actions require explicit user confirmation.
```

## What reviewers check

The directory's CI runs these against the pinned SHA:

1. **Schema:** `claude plugin validate` on `.claude-plugin/plugin.json` (extra keys fail).
2. **Entry invariants:** a lowercase name matching `^[a-z0-9][a-z0-9-]{1,63}$`, a description of 10–2000 characters with no hidden Unicode, and an https GitHub source pinned to a 40-character SHA.
3. **Auxiliary files:** `.mcp.json` must parse as JSON.
4. **Security review:** a Claude-based scan of the whole cloned repository, including `scripts/` and `tests/`, against the Anthropic Software Directory Policy and Acceptable Use Policy. It looks for credential exfiltration across services and for MCP launchers that are not pinned (`npx`, `uvx`, `bunx`, `pipx`).

How this plugin fares on the security review:

- **MCP:** a single remote HTTP server, `https://console.mermail.app/mcp`. It needs no local launcher.
- **Credentials:** OAuth by default. The optional `x-api-key` header carries the user's own Mermail key, `${MERMAIL_API_KEY:-}`, only to Mermail's own API. Nothing is read from credential stores.
- **Network and software disclosures:** answer **yes** to "makes external network calls" (the Mermail API) and **yes** to "may download additional software". The `mermail-cli` skill documents `npm install -g mermail-cli` as an optional step the user runs.

## Pre-submit checks

```bash
npm test
```

```bash
claude plugin validate .claude-plugin/marketplace.json
```

Validate the plugin manifest the way the directory does, without the local marketplace file:

```bash
tmp=$(mktemp -d) && git clone -q . "$tmp" && rm "$tmp/.claude-plugin/marketplace.json" && claude plugin validate "$tmp"
```

Check OAuth from a shell where `MERMAIL_API_KEY` is **unset**. Install the plugin, open `/mcp`, choose **Authenticate**, and confirm `list_mailboxes` works.
